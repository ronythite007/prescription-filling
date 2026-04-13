import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type Step = {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
};

interface PipelineStepsProps {
  steps: Step[];
}

export function PipelineSteps({ steps }: PipelineStepsProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors duration-200"
            style={{
              background: step.status === "done" ? "hsl(var(--accent) / 0.1)" :
                          step.status === "active" ? "hsl(var(--primary) / 0.1)" :
                          step.status === "error" ? "hsl(var(--destructive) / 0.1)" :
                          "hsl(var(--muted))",
              borderColor: step.status === "done" ? "hsl(var(--accent) / 0.3)" :
                           step.status === "active" ? "hsl(var(--primary) / 0.3)" :
                           step.status === "error" ? "hsl(var(--destructive) / 0.3)" :
                           "transparent",
              color: step.status === "done" ? "hsl(var(--accent))" :
                     step.status === "active" ? "hsl(var(--primary))" :
                     step.status === "error" ? "hsl(var(--destructive))" :
                     "hsl(var(--muted-foreground))",
            }}
          >
            {step.status === "done" && <CheckCircle className="w-3 h-3" />}
            {step.status === "active" && <Loader2 className="w-3 h-3 animate-spin" />}
            {step.status === "error" && <AlertCircle className="w-3 h-3" />}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <div className="w-4 h-px bg-border" />
          )}
        </div>
      ))}
    </div>
  );
}