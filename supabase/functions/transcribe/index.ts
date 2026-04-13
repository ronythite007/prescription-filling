import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const baseUrl = "https://api.assemblyai.com";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY not configured");

    const headers = {
      authorization: ASSEMBLYAI_API_KEY,
    };

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) throw new Error("No audio file provided");

    // Upload the audio file to AssemblyAI
    const audioData = await file.arrayBuffer();
    const uploadResponse = await fetch(`${baseUrl}/v2/upload`, {
      method: "POST",
      headers,
      body: audioData,
    });

    if (!uploadResponse.ok) {
      const errBody = await uploadResponse.text();
      console.error("AssemblyAI upload error:", uploadResponse.status, errBody);
      throw new Error(`Upload failed [${uploadResponse.status}]: ${errBody}`);
    }

    const uploadData = await uploadResponse.json();
    const audioUrl = uploadData.upload_url;

    const data = {
      audio_url: audioUrl,
      "language_detection": true,
      // Uses universal-3-pro for en, es, de, fr, it, pt. Else uses universal-2 for support across all other languages
      "speech_models": ["universal-3-pro", "universal-2"]
    };

    const url = `${baseUrl}/v2/transcript`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("AssemblyAI transcript create error:", response.status, errBody);
      throw new Error(`Transcript creation failed [${response.status}]: ${errBody}`);
    }

    const transcriptData = await response.json();
    const transcriptId = transcriptData.id;
    const pollingEndpoint = `${baseUrl}/v2/transcript/${transcriptId}`;

    while (true) {
      const pollingResponse = await fetch(pollingEndpoint, {
        headers: headers,
      });

      if (!pollingResponse.ok) {
        const errBody = await pollingResponse.text();
        throw new Error(`Polling failed [${pollingResponse.status}]: ${errBody}`);
      }

      const transcriptionResult = await pollingResponse.json();

      if (transcriptionResult.status === "completed") {
        return new Response(JSON.stringify({ text: transcriptionResult.text || "" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else if (transcriptionResult.status === "error") {
        throw new Error(`Transcription failed: ${transcriptionResult.error}`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  } catch (e) {
    console.error("transcribe error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
