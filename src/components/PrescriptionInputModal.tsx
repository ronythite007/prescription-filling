import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PrescriptionInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PrescriptionInputData) => void;
  isLoading?: boolean;
}

export interface PrescriptionInputData {
  practiceId: string;
  patientId: string;
  departmentId: string;
}

export function PrescriptionInputModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: PrescriptionInputModalProps) {
  const [practiceId, setPracticeId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [departmentId, setDepartmentId] = useState("82"); // Default department ID
  const [error, setError] = useState("");

  const handleSubmit = useCallback(() => {
    setError("");

    // Validation
    if (!practiceId.trim()) {
      setError("Practice ID is required");
      return;
    }
    if (!patientId.trim()) {
      setError("Patient ID is required");
      return;
    }
    if (!departmentId.trim()) {
      setError("Department ID is required");
      return;
    }

    onSubmit({
      practiceId: practiceId.trim(),
      patientId: patientId.trim(),
      departmentId: departmentId.trim(),
    });

    // Clear form
    setPracticeId("");
    setPatientId("");
    setDepartmentId("82");
  }, [practiceId, patientId, departmentId, onSubmit]);

  const handleClose = useCallback(() => {
    setError("");
    setPracticeId("");
    setPatientId("");
    setDepartmentId("82");
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Prescription Information</DialogTitle>
          <DialogDescription>
            Enter the patient and practice details to add medication to their chart
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="practice-id">Practice ID *</Label>
            <Input
              id="practice-id"
              placeholder="e.g., 195900"
              value={practiceId}
              onChange={(e) => setPracticeId(e.target.value)}
              disabled={isLoading}
              type="number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="patient-id">Patient ID *</Label>
            <Input
              id="patient-id"
              placeholder="e.g., 12345"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              disabled={isLoading}
              type="number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="department-id">Department ID</Label>
            <Input
              id="department-id"
              placeholder="e.g., 82"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={isLoading}
              type="number"
            />
            <p className="text-xs text-muted-foreground">
              Default: 82 (can be customized if needed)
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : "Submit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
