import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const { transcribedText } = await req.json();
    if (!transcribedText) throw new Error("No transcribedText provided");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [
          {
            role: "system",
            content: `You are a medical assistant that extracts medication names from prescription transcriptions.
            
Your task is to identify all medication names mentioned in the provided prescription text.
Return ONLY a JSON object with this exact format:
{
  "medications": ["medication1", "medication2", "medication3"]
}

Important:
- Extract ONLY medication names (e.g., "Paracetamol", "Ibuprofen", "Aspirin")
- Do NOT include dosages, frequencies, or routes in the medication name
- If no medications are found, return: {"medications": []}
- Always return valid JSON`,
          },
          {
            role: "user",
            content: `Extract medication names from this prescription transcription:

"${transcribedText}"

Return ONLY the JSON object with the medications array.`,
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

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    // Parse the JSON response
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (_e) {
      throw new Error(`Failed to parse Groq response: ${content}`);
    }

    const medications = parsedContent.medications || [];

    return new Response(
      JSON.stringify({
        medicationNames: medications,
        rawText: transcribedText,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
