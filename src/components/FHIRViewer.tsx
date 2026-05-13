import { useState } from "react";
import { Code, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface FHIRViewerProps {
  fhirJson: object | null;
  isLoading: boolean;
}

export function FHIRViewer({ fhirJson, isLoading }: FHIRViewerProps) {
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-card animate-fade-up">
        <div className="flex items-center gap-2 mb-3">
          <Code className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">FHIR MedicationRequest</h3>
        </div>
        <div className="h-40 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }

  if (!fhirJson) return null;

  const jsonString = JSON.stringify(fhirJson, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToEHR = () => {
    toast.success("FHIR payload is ready to send to EHR");
  };

  return (
    <div className="rounded-lg border bg-card p-5 shadow-card animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">FHIR MedicationRequest</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5 h-8">
          {copied ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="text-xs font-mono leading-relaxed p-4 rounded-md bg-foreground/[0.03] border overflow-x-auto max-h-80">
        {jsonString}
      </pre>
      <div className="mt-4 flex justify-end">
        <Button onClick={handleSendToEHR} className="gap-2">
          Send to EHR
        </Button>
      </div>
    </div>
  );
}