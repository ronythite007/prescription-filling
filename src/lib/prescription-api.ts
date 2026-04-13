import type { MedicationData } from "@/components/MedicationCard";

const ASSEMBLYAI_API_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY || "";
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

type AssemblyUploadResponse = {
  upload_url?: string;
};

type AssemblyTranscriptCreateResponse = {
  id?: string;
};

type AssemblyTranscriptPollingResponse = {
  status?: "queued" | "processing" | "completed" | "error";
  text?: string;
  error?: string;
};

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  if (!ASSEMBLYAI_API_KEY) {
    throw new Error("AssemblyAI API key not configured");
  }

  try {
    // Upload audio file to AssemblyAI
    const uploadFormData = new FormData();
    uploadFormData.append("file", audioBlob);

    console.log("Uploading audio to AssemblyAI...");
    const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
      },
      body: uploadFormData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadData = (await uploadResponse.json()) as AssemblyUploadResponse;
    const audioUrl = uploadData.upload_url;

    if (!audioUrl) {
      throw new Error("No audio URL returned from upload");
    }

    // Create transcription request
    console.log("Creating transcription request...");
    const transcriptResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language_detection: true,
        speech_models: ["universal-3-pro", "universal-2"],
      }),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      throw new Error(`Transcript creation failed: ${transcriptResponse.status} - ${errorText}`);
    }

    const transcriptData = (await transcriptResponse.json()) as AssemblyTranscriptCreateResponse;
    const transcriptId = transcriptData.id;

    if (!transcriptId) {
      throw new Error("No transcript ID returned");
    }

    // Poll for transcription completion
    console.log(`Polling for transcription (ID: ${transcriptId})...`);
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes with 5-second intervals

    while (attempts < maxAttempts) {
      const pollingResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          Authorization: ASSEMBLYAI_API_KEY,
        },
      });

      if (!pollingResponse.ok) {
        throw new Error(`Polling failed: ${pollingResponse.status}`);
      }

      const pollingData = (await pollingResponse.json()) as AssemblyTranscriptPollingResponse;

      if (pollingData.status === "completed") {
        console.log("Transcription completed!");
        return pollingData.text || "";
      }

      if (pollingData.status === "error") {
        throw new Error(`Transcription error: ${pollingData.error}`);
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error("Transcription timeout - took too long");
  } catch (err: unknown) {
    console.error("Transcribe error:", err);
    throw new Error(getErrorMessage(err, "Failed to transcribe audio"));
  }
}

export async function extractMedication(transcript: string, patientId: string): Promise<MedicationData> {
  if (!GROQ_API_KEY) {
    throw new Error("Groq API key not configured");
  }

  try {
    const prompt = `You are a medical data extraction assistant.

  The patient ID for this prescription is: ${patientId}
  Use it only as context to keep the extracted record aligned with the correct patient.

Extract structured information from the given prescription text.

Return ONLY valid JSON in this exact format with no additional text:

{
  "patient_name": "extracted patient name or 'Unknown'",
  "medication_name": "extracted medication name",
  "dosage": "extracted dosage amount",
  "frequency": "how often to take (e.g., twice daily)",
  "duration": "how long to take it (e.g., 10 days)"
}

Prescription Text:
"""${transcript}"""`;

    console.log("Extracting medication with Groq...");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as GroqChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No extraction result returned");
    }

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not extract JSON from Groq response");
    }

    const extracted = JSON.parse(jsonMatch[0]) as MedicationData;

    // Provide defaults for any missing fields
    return {
      patient_name: extracted.patient_name || "Unknown",
      medication_name: extracted.medication_name || "Unknown",
      dosage: extracted.dosage || "Not specified",
      frequency: extracted.frequency || "Not specified",
      duration: extracted.duration || "Not specified",
    };
  } catch (err: unknown) {
    console.error("Extraction error:", err);
    throw new Error(getErrorMessage(err, "Failed to extract medication details"));
  }
}

export function generateFHIR(med: MedicationData, patientId: string) {
  return {
    resourceType: "MedicationRequest",
    status: "active",
    intent: "order",
    medicationCodeableConcept: {
      text: med.medication_name,
    },
    subject: {
      reference: `Patient/${patientId}`,
      identifier: {
        system: "urn:patient-id",
        value: patientId,
      },
      display: med.patient_name,
    },
    dosageInstruction: [
      {
        text: `${med.dosage} ${med.frequency} for ${med.duration}`,
      },
    ],
    authoredOn: new Date().toISOString(),
  };
}