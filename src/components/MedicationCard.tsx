import { Pill, User, Clock, Calendar, Activity } from "lucide-react";

export interface MedicationData {
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  patient_name: string;
}

interface MedicationCardProps {
  data: MedicationData | null;
  isLoading: boolean;
}

const fields = [
  { key: "medication_name", label: "Medication", icon: Pill },
  { key: "dosage", label: "Dosage", icon: Activity },
  { key: "frequency", label: "Frequency", icon: Clock },
  { key: "duration", label: "Duration", icon: Calendar },
  { key: "patient_name", label: "Patient", icon: User },
] as const;

export function MedicationCard({ data, isLoading }: MedicationCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-5 shadow-card animate-fade-up">
        <h3 className="text-sm font-semibold tracking-tight mb-4">Extracted Medication Details</h3>
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.key} className="p-3 rounded-md bg-muted/60">
              <div className="h-3 w-16 rounded bg-muted animate-pulse mb-2" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-lg border bg-card p-5 shadow-card animate-fade-up">
      <h3 className="text-sm font-semibold tracking-tight mb-4">Extracted Medication Details</h3>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((f) => {
          const Icon = f.icon;
          const value = data[f.key];
          return (
            <div key={f.key} className="p-3 rounded-md bg-secondary/50">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{f.label}</span>
              </div>
              <p className="text-sm font-semibold text-foreground">{value || "—"}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}