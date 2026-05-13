/**
 * Medication Extraction Service
 * Utilities for medication handling
 */

interface MedicationExtractionResult {
  medicationNames: string[];
  rawText: string;
}

const STOPWORDS = new Set([
  "please",
  "take",
  "takes",
  "taking",
  "give",
  "gives",
  "given",
  "prescribe",
  "prescribed",
  "prescription",
  "tablet",
  "tablets",
  "capsule",
  "capsules",
  "mg",
  "mcg",
  "g",
  "ml",
  "once",
  "twice",
  "three",
  "four",
  "daily",
  "every",
  "night",
  "nightly",
  "morning",
  "evening",
  "before",
  "after",
  "with",
  "without",
  "for",
  "pain",
  "fever",
  "infection",
  "food",
  "day",
  "week",
  "weeks",
  "month",
  "months",
]);

const SPLIT_PATTERN = /(?:,|;|\band\b|\bplus\b|\b&\b|\/|\+)+/gi;
const DURATION_AND_ROUTE_PATTERN = /\b(?:mg|mcg|g|ml|tablet(?:s)?|capsule(?:s)?|syrup|solution|injection|oral|po|iv|im|sc|subcutaneous|topical|daily|twice|three times|four times|once|morning|evening|nightly|bedtime|as needed|prn)\b.*$/i;

function cleanCandidate(candidate: string): string {
  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyMedicationName(candidate: string): boolean {
  const words = candidate.split(" ").filter(Boolean);
  if (words.length === 0) {
    return false;
  }

  return words.some((word) => !STOPWORDS.has(word) && /[a-z]/i.test(word));
}

/**
 * Clean and normalize medication name for search
 */
export function normalizeMedicationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

/**
 * Format date to MM/DD/YYYY format required by Athena Health API
 */
export function formatDateForAthena(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  const year = dateObj.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Extract medication names from transcribed text
 * Users will manually enter medications after hearing the transcription
 */
export async function extractMedicationsFromTranscription(
  transcribedText: string
): Promise<MedicationExtractionResult> {
  const normalizedText = cleanCandidate(transcribedText);
  const rawSegments = normalizedText.split(SPLIT_PATTERN);

  const medicationNames = rawSegments
    .map((segment) => segment.replace(DURATION_AND_ROUTE_PATTERN, "").trim())
    .map((segment) => segment.split(" ").slice(0, 4).join(" ").trim())
    .map((segment) => segment.replace(/^take\s+|^use\s+|^give\s+|^prescribe\s+/i, "").trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => isLikelyMedicationName(segment))
    .map((segment) => segment.replace(/\s+/g, " "));

  const uniqueMedicationNames = Array.from(new Set(medicationNames));

  return {
    medicationNames: uniqueMedicationNames,
    rawText: transcribedText,
  };
}

