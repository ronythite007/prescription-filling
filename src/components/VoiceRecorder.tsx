import { useState, useRef, useCallback } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onAudioReady: (blob: Blob, filename: string) => void;
  isProcessing: boolean;
  isEnabled: boolean;
}

export function VoiceRecorder({ onAudioReady, isProcessing, isEnabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onAudioReady(blob, "recording.webm");
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      alert("Microphone access is required to record audio.");
    }
  }, [onAudioReady]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    clearInterval(timerRef.current);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onAudioReady(file, file.name);
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Recording button */}
      <div className="relative">
        {isRecording && (
          <>
            <div className="absolute inset-0 rounded-full bg-destructive/20 animate-pulse-ring" />
            <div className="absolute inset-0 rounded-full bg-destructive/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
          </>
        )}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing || !isEnabled}
          className={cn(
            "relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:opacity-50 disabled:pointer-events-none",
            isRecording
              ? "bg-destructive text-destructive-foreground shadow-elevated"
              : "bg-primary text-primary-foreground shadow-card hover:shadow-card-hover"
          )}
        >
          {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-7 h-7" />}
        </button>
      </div>

      {isRecording && (
        <p className="text-sm font-medium text-destructive tabular-nums animate-fade-up">
          Recording — {formatTime(recordingTime)}
        </p>
      )}

      {!isRecording && (
        <p className="text-sm text-muted-foreground">
          {isProcessing
            ? "Processing…"
            : isEnabled
              ? "Tap to record or upload an audio file"
              : "Enter a patient ID to enable audio input"}
        </p>
      )}

      {/* Upload fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileUpload}
      />
      {!isRecording && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing || !isEnabled}
          className="gap-2"
        >
          <Upload className="w-4 h-4" />
          Upload Audio File
        </Button>
      )}
    </div>
  );
}