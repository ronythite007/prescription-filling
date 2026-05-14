import { useState } from "react";
import { toast } from "sonner";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { TranscriptDisplay } from "@/components/TranscriptDisplay";
import { transcribeAudio } from "@/lib/prescription-api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { athenaHealthAPI } from "@/lib/athena-health-api";
import { extractMedicationsFromTranscription, formatDateForAthena } from "@/lib/medication-extraction";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { smartGoBack } from "@/lib/return-navigation";

type StepStatus = "pending" | "active" | "done" | "error";

type SubmissionStatus = "success" | "failed";

interface MedicationRequest {
  medicationName: string;
  medicationId: number;
  payload: {
    medicationid: number;
    departmentid: number;
    startdate: string;
    patientnote: string;
  };
}

interface SubmissionSummaryItem {
  medicationName: string;
  medicationId: number;
  status: SubmissionStatus;
  error?: string;
}

interface SubmissionSummary {
  submittedAt: string;
  practiceId: string;
  patientId: string;
  departmentId: string;
  patientNote: string;
  total: number;
  successCount: number;
  failureCount: number;
  items: SubmissionSummaryItem[];
}

const Index = () => {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [practiceId, setPracticeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [isAddingToAthena, setIsAddingToAthena] = useState(false);
  const [extractedMedications, setExtractedMedications] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<StepStatus>("pending");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [preparedRequests, setPreparedRequests] = useState<MedicationRequest[]>([]);
  const [isPreparingRequests, setIsPreparingRequests] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<Map<string, number>>(new Map());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary | null>(null);

  const resetState = () => {
    setTranscript(null);
    setExtractedMedications([]);
    setSelectedMedications(new Map());
    setPreparedRequests([]);
    setShowConfirmModal(false);
    setIsPreparingRequests(false);
    setCurrentStep("pending");
    setSubmissionSummary(null);
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus(null);

    const result = await athenaHealthAPI.testConnection();
    setConnectionStatus(result);
    setIsTestingConnection(false);

    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleAudioReady = async (blob: Blob) => {
    const trimmedPatientId = patientId.trim();
    const trimmedPracticeId = practiceId.trim();
    const trimmedDepartmentId = departmentId.trim();
    if (!trimmedPatientId) {
      toast.error("Enter a Patient ID before recording or uploading audio");
      return;
    }

    if (!trimmedPracticeId || !trimmedDepartmentId) {
      toast.error("Enter Practice ID and Department ID before processing audio");
      return;
    }

    resetState();
    setIsProcessing(true);
    setCurrentStep("active");

    try {
      // Transcribe audio
      const text = await transcribeAudio(blob);
      setTranscript(text);

      const { medicationNames } = await extractMedicationsFromTranscription(text);

      if (medicationNames.length === 0) {
        setCurrentStep("error");
        toast.error("No medications were detected from the transcription");
        return;
      }

      setIsPreparingRequests(true);

      const resolvedMedications = new Map<string, number>();
      const requests: MedicationRequest[] = [];
      const today = formatDateForAthena(new Date());

      for (const medicationName of medicationNames) {
        const results = await athenaHealthAPI.searchMedications(trimmedPracticeId, medicationName);

        if (results.length === 0) {
          toast.warning(`No Athena medication ID found for "${medicationName}"`);
          continue;
        }

        const medication = results[0];
        console.log(`[Athena Debug] Resolved medication id for "${medicationName}": ${medication.medicationid}`);
        resolvedMedications.set(medicationName, medication.medicationid);

        requests.push({
          medicationName,
          medicationId: medication.medicationid,
          payload: {
            medicationid: medication.medicationid,
            departmentid: parseInt(trimmedDepartmentId),
            startdate: today,
            patientnote: text,
          },
        });
      }

      setSelectedMedications(resolvedMedications);
      setExtractedMedications(Array.from(resolvedMedications.keys()));

      if (requests.length === 0) {
        setCurrentStep("error");
        toast.error("Medications were detected, but no Athena IDs were found");
        return;
      }

      setPreparedRequests(requests);
      setCurrentStep("done");
      toast.success(`Detected ${requests.length} medication(s) from transcription`);

      // Show confirmation modal so user can review requests before submitting
      setShowConfirmModal(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      console.error("[Athena Debug] Failed while processing audio or searching medications:", error);
      toast.error(message);
      setCurrentStep("error");
    } finally {
      setIsProcessing(false);
      setIsPreparingRequests(false);
    }
  };

  const submitRequests = async (requestsToSubmit: MedicationRequest[] = preparedRequests) => {
    const trimmedPracticeId = practiceId.trim();
    const trimmedPatientId = patientId.trim();
    const trimmedDepartmentId = departmentId.trim();

    setIsAddingToAthena(true);

    try {
      let successCount = 0;
      let failureCount = 0;
      const summaryItems: SubmissionSummaryItem[] = [];

      // Submit each prepared request
      for (const request of requestsToSubmit) {
        try {
          await athenaHealthAPI.addMedicationToChart(
            trimmedPracticeId,
            trimmedPatientId,
            request.payload
          );

          successCount++;
          summaryItems.push({
            medicationName: request.medicationName,
            medicationId: request.medicationId,
            status: "success",
          });
          toast.success(`${request.medicationName} added to patient chart`);
        } catch (error) {
          failureCount++;
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          summaryItems.push({
            medicationName: request.medicationName,
            medicationId: request.medicationId,
            status: "failed",
            error: errorMsg,
          });
          toast.error(`Failed to add ${request.medicationName}: ${errorMsg}`);
        }
      }

      if (successCount > 0) {
        toast.success(
          `${successCount} medication(s) added to Athena Health successfully`
        );
      }

      setSubmissionSummary({
        submittedAt: new Date().toLocaleString(),
        practiceId: trimmedPracticeId,
        patientId: trimmedPatientId,
        departmentId: trimmedDepartmentId,
        patientNote: requestsToSubmit[0]?.payload.patientnote ?? "",
        total: requestsToSubmit.length,
        successCount,
        failureCount,
        items: summaryItems,
      });

      setShowConfirmModal(false);
      setPreparedRequests([]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add to Athena Health"
      );
    } finally {
      setIsAddingToAthena(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header Section */}
        <div className="space-y-4 animate-fade-up text-center">
          <div className="flex justify-start">
            <Button variant="outline" onClick={smartGoBack} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Voice-Based Prescription Refill</h1>
            <p className="text-muted-foreground">Record or upload a prescription audio file, extract medications, and add them to Athena Health</p>
          </div>
        </div>

        {/* Input Section */}
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Patient & Practice Information</CardTitle>
            <CardDescription>Required information to process the prescription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Practice ID */}
            <div className="space-y-2">
              <Label htmlFor="practice-id" className="text-sm font-medium">
                Practice ID
              </Label>
              <Input
                id="practice-id"
                value={practiceId}
                onChange={(e) => setPracticeId(e.target.value)}
                placeholder="e.g. 123456"
                autoComplete="off"
              />
            </div>

            {/* Patient ID */}
            <div className="space-y-2">
              <Label htmlFor="patient-id" className="text-sm font-medium">
                Patient ID
              </Label>
              <Input
                id="patient-id"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="e.g. P-10284"
                autoComplete="off"
              />
            </div>

            {/* Department ID */}
            <div className="space-y-2">
              <Label htmlFor="department-id" className="text-sm font-medium">
                Department ID
              </Label>
              <Input
                id="department-id"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                placeholder="e.g. 82"
                autoComplete="off"
              />
            </div>

            {/* Test Athena Connection */}
            {/* <div className="pt-4 border-t space-y-3">
              <Button
                onClick={handleTestConnection}
                disabled={isTestingConnection}
                variant="outline"
                className="w-full"
              >
                {isTestingConnection ? "Testing Connection..." : "Test Athena Connection"}
              </Button>
              {connectionStatus && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    connectionStatus.success
                      ? "bg-green-50 border border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
                      : "bg-red-50 border border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
                  }`}
                >
                  {connectionStatus.message}
                </div>
              )}
            </div> */}
          </CardContent>
        </Card>

        {/* Voice input */}
        <section className="rounded-xl border bg-card p-8 shadow-card animate-fade-up flex items-center justify-center min-h-[320px]">
          <VoiceRecorder 
            onAudioReady={handleAudioReady} 
            isProcessing={isProcessing} 
            isEnabled={Boolean(patientId.trim())} 
          />
        </section>

        {/* Status indicator */}
        {currentStep !== "pending" && (
          <div className="flex justify-center animate-fade-up">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary">
              {currentStep === "active" && (
                <>
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-medium">Processing transcription...</span>
                </>
              )}
              {currentStep === "done" && (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Transcription complete</span>
                </>
              )}
              {currentStep === "error" && (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium">Error during transcription</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="space-y-4">
          {/* Transcript Display */}
          <TranscriptDisplay transcript={transcript} isLoading={false} />

          {/* Automatic Medication Resolution */}
          {transcript && (
            <Card className="animate-fade-up">
              <CardHeader>
                <CardTitle>Automatically Detected Medications</CardTitle>
                <CardDescription>
                  The transcription is used to detect medication names, fetch Athena medication IDs, and prepare the POST payload automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {isPreparingRequests && (
                  <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-3 text-sm">
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    Resolving medication names and Athena IDs...
                  </div>
                )}

                {!isPreparingRequests && extractedMedications.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No medications were resolved from the transcription.
                  </p>
                )}

                {extractedMedications.length > 0 && (
                  <div className="space-y-2">
                    {extractedMedications.map((medicationName) => (
                      <div
                        key={medicationName}
                        className="flex items-center justify-between rounded-lg border bg-green-50 px-4 py-3 dark:bg-green-950 dark:border-green-800"
                      >
                        <div>
                          <p className="font-medium text-sm">{medicationName}</p>
                          <p className="text-xs text-muted-foreground">
                            Medication ID: <span className="font-mono font-semibold text-foreground">{selectedMedications.get(medicationName)}</span>
                          </p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {submissionSummary && (
            <Card className="animate-fade-up border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle>Submitted Requests</CardTitle>
                <CardDescription>
                  This card shows exactly what was submitted to Athena Health and the outcome for each medication.
                </CardDescription>
                <div className="rounded-lg border bg-background/80 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Patient Note
                  </p>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
                    {submissionSummary.patientNote || "No patient note was available for this submission."}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-background p-3 border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitted</p>
                    <p className="mt-1 text-sm font-medium">{submissionSummary.submittedAt}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Practice ID</p>
                    <p className="mt-1 text-sm font-medium font-mono">{submissionSummary.practiceId}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Patient ID</p>
                    <p className="mt-1 text-sm font-medium font-mono">{submissionSummary.patientId}</p>
                  </div>
                  <div className="rounded-lg bg-background p-3 border">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department ID</p>
                    <p className="mt-1 text-sm font-medium font-mono">{submissionSummary.departmentId}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-secondary px-3 py-1 font-medium">
                    Total: {submissionSummary.total}
                  </span>
                  <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800 dark:bg-green-950 dark:text-green-200">
                    Success: {submissionSummary.successCount}
                  </span>
                  <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
                    Failed: {submissionSummary.failureCount}
                  </span>
                </div>

                <div className="space-y-2">
                  {submissionSummary.items.map((item) => (
                    <div
                      key={`${item.medicationId}-${item.medicationName}`}
                      className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${
                        item.status === "success"
                          ? "bg-green-50 dark:bg-green-950/40 dark:border-green-800"
                          : "bg-red-50 dark:bg-red-950/40 dark:border-red-800"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{item.medicationName}</p>
                        <p className="text-xs text-muted-foreground">
                          Medication ID: <span className="font-mono font-semibold text-foreground">{item.medicationId}</span>
                        </p>
                        {item.error && (
                          <p className="mt-1 text-xs text-red-700 dark:text-red-300">{item.error}</p>
                        )}
                      </div>
                      <div
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                          item.status === "success"
                            ? "bg-green-600 text-white"
                            : "bg-red-600 text-white"
                        }`}
                      >
                        {item.status}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Review Medication Requests</DialogTitle>
            <DialogDescription>
              Please review the following API requests before submitting to Athena Health
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {preparedRequests.map((request, idx) => (
                <Card key={idx} className="border">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                          {request.medicationName}
                        </CardTitle>
                        <CardDescription>
                          Medication ID: {request.medicationId}
                        </CardDescription>
                      </div>
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">
                        Request #{idx + 1}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-3">
                      {/* Request Details */}
                      <div className="bg-muted rounded-lg p-4">
                        <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <span className="text-xs bg-green-600 text-white px-2 py-1 rounded font-mono">
                            POST
                          </span>
                          <span className="font-mono text-xs break-all">
                            /v1/{practiceId}/chart/{patientId}/medications
                          </span>
                        </p>

                        {/* JSON Payload */}
                        <div className="bg-background rounded border border-border p-3 text-xs font-mono overflow-x-auto">
                          <pre className="whitespace-pre-wrap break-words">
{JSON.stringify(request.payload, null, 2)}
                          </pre>
                        </div>
                      </div>

                      {/* Payload Breakdown */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-secondary/50 rounded p-2">
                          <p className="text-xs font-semibold text-muted-foreground">Medication ID</p>
                          <p className="font-mono">{request.payload.medicationid}</p>
                        </div>
                        <div className="bg-secondary/50 rounded p-2">
                          <p className="text-xs font-semibold text-muted-foreground">Department ID</p>
                          <p className="font-mono">{request.payload.departmentid}</p>
                        </div>
                        <div className="bg-secondary/50 rounded p-2">
                          <p className="text-xs font-semibold text-muted-foreground">Start Date</p>
                          <p className="font-mono">{request.payload.startdate}</p>
                        </div>
                        <div className="bg-secondary/50 rounded p-2">
                          <p className="text-xs font-semibold text-muted-foreground">Patient ID</p>
                          <p className="font-mono">{patientId}</p>
                        </div>
                      </div>

                      {/* Patient Note */}
                      <div className="bg-secondary/50 rounded p-3">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Patient Note (Transcription)</p>
                        <p className="text-sm leading-relaxed italic text-foreground/90">
                          {request.payload.patientnote}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmModal(false);
                setPreparedRequests([]);
              }}
              disabled={isAddingToAthena}
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitRequests()}
              disabled={isAddingToAthena}
              className="gap-2"
            >
              {isAddingToAthena ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Submit Requests
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;