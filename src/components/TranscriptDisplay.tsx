import { FileText } from "lucide-react";

interface TranscriptDisplayProps {
  transcript: string | null;
  isLoading: boolean;
}

export function TranscriptDisplay({ transcript, isLoading }: TranscriptDisplayProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-card animate-fade-up">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Transcript</h3>
        </div>
        <div className="space-y-2">
          <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!transcript) return null;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-card animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold tracking-tight">Transcript</h3>
      </div>
      <p className="text-foreground leading-relaxed">{transcript}</p>
    </div>
  );
}