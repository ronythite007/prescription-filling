import { useState } from "react";
import { toast } from "sonner";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { TranscriptDisplay } from "@/components/TranscriptDisplay";
import { MedicationCard, type MedicationData } from "@/components/MedicationCard";
import { FHIRViewer } from "@/components/FHIRViewer";
import { PipelineSteps } from "@/components/PipelineSteps";
import { transcribeAudio, extractMedication, generateFHIR } from "@/lib/prescription-api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type StepStatus = "pending" | "active" | "done" | "error";

const Index = () => {
  const [transcript, setTranscript] = useState<string | null>(null);
  const [medication, setMedication] = useState<MedicationData | null>(null);
  const [fhirJson, setFhirJson] = useState<object | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [patientId, setPatientId] = useState("");

  const [steps, setSteps] = useState<{ id: string; label: string; status: StepStatus }[]>([
    { id: "transcribe", label: "Transcribe", status: "pending" },
    { id: "extract", label: "Extract", status: "pending" },
    { id: "fhir", label: "FHIR", status: "pending" },
  ]);

  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [medLoading, setMedLoading] = useState(false);
  const [fhirLoading, setFhirLoading] = useState(false);

  const updateStep = (id: string, status: StepStatus) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

  const resetState = () => {
    setTranscript(null);
    setMedication(null);
    setFhirJson(null);
    setSteps((prev) => prev.map((s) => ({ ...s, status: "pending" as StepStatus })));
  };

  const handleAudioReady = async (blob: Blob) => {
    const trimmedPatientId = patientId.trim();
    if (!trimmedPatientId) {
      toast.error("Enter a patient ID before recording or uploading audio");
      return;
    }

    resetState();
    setIsProcessing(true);

    try {
      // Step 1: Transcribe
      updateStep("transcribe", "active");
      setTranscriptLoading(true);
      const text = await transcribeAudio(blob);
      setTranscript(text);
      setTranscriptLoading(false);
      updateStep("transcribe", "done");

      // Step 2: Extract
      updateStep("extract", "active");
      setMedLoading(true);
      const med = await extractMedication(text, trimmedPatientId);
      setMedication(med);
      setMedLoading(false);
      updateStep("extract", "done");

      // Step 3: FHIR
      updateStep("fhir", "active");
      setFhirLoading(true);
      const fhir = generateFHIR(med, trimmedPatientId);
      setFhirJson(fhir);
      setFhirLoading(false);
      updateStep("fhir", "done");

      toast.success("Prescription generated successfully");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
      const activeStep = steps.find((s) => s.status === "active");
      if (activeStep) updateStep(activeStep.id, "error");
      setTranscriptLoading(false);
      setMedLoading(false);
      setFhirLoading(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header Section */}
        <div className="space-y-2 animate-fade-up text-center">
          <h1 className="text-3xl font-bold tracking-tight">Voice-Based Prescription Refill</h1>
          <p className="text-muted-foreground">Simply record your prescription details or upload an audio file for instant processing</p>
        </div>

        <section className="rounded-xl border bg-card p-6 shadow-card animate-fade-up space-y-3">
          <div className="space-y-1">
            <Label htmlFor="patient-id" className="text-sm font-medium">
              Patient ID
            </Label>
            <p className="text-xs text-muted-foreground">Enter the patient identifier before recording so the prescription stays matched to the right patient.</p>
          </div>
          <Input
            id="patient-id"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            placeholder="e.g. P-10284"
            autoComplete="off"
          />
        </section>

        {/* Voice input */}
        <section className="rounded-xl border bg-card p-8 shadow-card animate-fade-up flex items-center justify-center min-h-[320px]">
          <VoiceRecorder onAudioReady={handleAudioReady} isProcessing={isProcessing} isEnabled={Boolean(patientId.trim())} />
        </section>

        {/* Pipeline indicator */}
        {steps.some((s) => s.status !== "pending") && (
          <div className="flex justify-center animate-fade-up" style={{ animationDelay: "80ms" }}>
            <PipelineSteps steps={steps} />
          </div>
        )}

        {/* Results */}
        <div className="space-y-4">
          <TranscriptDisplay transcript={transcript} isLoading={transcriptLoading} />
          <MedicationCard data={medication} isLoading={medLoading} />
          <FHIRViewer fhirJson={fhirJson} isLoading={fhirLoading} />
        </div>
      </main>
    </div>
  );
};

export default Index;