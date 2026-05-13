/**
 * Athena Health API Service
 * Handles OAuth2 authentication and medication-related API calls
 */

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

type TokenRequestMode = "basic-auth" | "body-credentials";

interface MedicationSearchResult {
  medicationid: number;
  medicationname: string;
  medicationdosage?: string;
  medicationroute?: string;
}

interface MedicationSearchResponse {
  medications?: unknown[];
  medication?: unknown[];
  items?: unknown[];
  results?: unknown[];
  result?: unknown[];
  medicationlist?: unknown[];
  medicationList?: unknown[];
  data?: unknown[];
  totalcount?: number;
}

interface AddMedicationPayload {
  medicationid: number;
  departmentid: number;
  startdate: string;
  patientnote: string;
}

interface AddMedicationResponse {
  success?: boolean;
  medicationid?: number;
  message?: string;
}

function sanitizeMedicationSearchName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/\s+\d+(?:\.\d+)?(?:\s*(?:mg|mcg|g|ml|units?|iu))?\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || name.trim();
}

function getAthenaMedicationSearchValue(medicationName: string): string {
  return sanitizeMedicationSearchName(medicationName);
}

class AthenaHealthAPI {
  private clientId: string;
  private clientSecret: string;
  private tokenUrl: string;
  private baseUrl: string;
  private practiceId: string;
  private tokenScope: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor() {
    this.clientId = (import.meta.env.VITE_ATHENA_CLIENT_ID || "").trim();
    this.clientSecret = (import.meta.env.VITE_ATHENA_CLIENT_SECRET || "").trim();
    this.tokenUrl =
      (import.meta.env.VITE_ATHENA_TOKEN_URL ||
      "https://api.preview.platform.athenahealth.com/oauth2/v1/token").trim();
    this.baseUrl = (import.meta.env.VITE_ATHENA_BASE_URL || "").trim();
    this.practiceId = (import.meta.env.VITE_ATHENA_PRACTICE_ID || "").trim();
    this.tokenScope = (import.meta.env.VITE_ATHENA_SCOPE || "").trim();

    if (!this.clientId || !this.clientSecret) {
      console.warn("Athena Health credentials not configured");
    }

    if (this.clientSecret === "put_your_client_secret_here") {
      console.warn(
        "Athena Health client secret is still a placeholder. Replace VITE_ATHENA_CLIENT_SECRET with a real value."
      );
    }
  }

  /**
   * Get or refresh OAuth2 access token
   */
  private async getAccessToken(): Promise<string> {
    // Return existing token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      console.log("[Athena Debug] Using cached token");
      return this.accessToken;
    }

    console.log("[Athena Debug] Requesting new token...");

    try {
      // Athena OAuth commonly expects client credentials via Basic auth.
      // Keep a body-credentials fallback for environments configured differently.
      const data = await this.requestToken("basic-auth").catch(async (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[Athena Debug] Basic Auth failed: ${errorMessage}`);
        
        if (!errorMessage.includes("401")) {
          throw error;
        }

        console.log("[Athena Debug] Trying Body Credentials fallback...");
        return this.requestToken("body-credentials");
      });

      this.accessToken = data.access_token;
      // Set expiration with 5-minute buffer
      this.tokenExpiresAt =
        Date.now() + (data.expires_in - 300) * 1000;

      console.log("Athena Health token obtained successfully");
      return this.accessToken;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to obtain Athena Health token: ${message}`);
    }
  }

  private async requestToken(mode: TokenRequestMode): Promise<TokenResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    const body = new URLSearchParams({
      grant_type: "client_credentials",
    });

    if (this.tokenScope) {
      body.append("scope", this.tokenScope);
    }

    if (mode === "basic-auth") {
      // Create Basic Auth header
      const credentials = `${this.clientId}:${this.clientSecret}`;
      headers.Authorization = `Basic ${btoa(credentials)}`;
      console.log(`[Athena Debug] Using Basic Auth mode - Client ID: ${this.clientId}`);
    } else {
      body.append("client_id", this.clientId);
      body.append("client_secret", this.clientSecret);
      console.log(`[Athena Debug] Using Body Credentials mode - Client ID: ${this.clientId}`);
    }

    console.log(`[Athena Debug] Token URL: ${this.tokenUrl}`);
    console.log(`[Athena Debug] Request mode: ${mode}`);
    console.log(`[Athena Debug] Headers:`, JSON.stringify({...headers, Authorization: headers.Authorization ? "***" : undefined}));
    console.log(`[Athena Debug] Body params:`, body.toString().replace(/client_secret=[^&]+/, 'client_secret=***'));

    const response = await fetch(this.tokenUrl, {
      method: "POST",
      headers,
      body,
    });

    console.log(`[Athena Debug] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Athena Debug] Full error response: ${errorText}`);
      console.error(`[Athena Debug] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (
        response.status === 401 &&
        /invalid client|client secret.*invalid/i.test(errorText)
      ) {
        throw new Error(
          "Token request failed: Athena rejected the client credentials. Verify VITE_ATHENA_CLIENT_ID and VITE_ATHENA_CLIENT_SECRET in .env match the credentials in Athena Developer Portal."
        );
      }

      throw new Error(
        `Token request failed (${mode}): ${response.status} - ${errorText}`
      );
    }

    return (await response.json()) as TokenResponse;
  }

  /**
   * Search for medications by name
   */
  async searchMedications(
    practiceId: string,
    medicationName: string
  ): Promise<MedicationSearchResult[]> {
    try {
      const token = await this.getAccessToken();

      if (!practiceId) {
        throw new Error("Practice ID not provided");
      }

      const searchValue = getAthenaMedicationSearchValue(medicationName);
      console.log(`Searching medications for: ${searchValue}`);

      // Athena preview requires `searchvalue` for this endpoint.
      return this.searchMedicationsWithParam(
        practiceId,
        searchValue,
        "searchvalue",
        token
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to search medications: ${message}`);
    }
  }

  private async searchMedicationsWithParam(
    practiceId: string,
    medicationName: string,
    queryParamName: "name" | "searchvalue",
    token: string
  ): Promise<MedicationSearchResult[]> {
    const url = new URL(
      `/v1/${practiceId}/reference/medications`,
      this.baseUrl
    );
    url.searchParams.append(queryParamName, medicationName);

    console.log(`[Athena Debug] Searching medications with param '${queryParamName}': ${medicationName}`);
    console.log(`[Athena Debug] Full URL: ${url.toString()}`);
    console.log(`[Athena Debug] Token present: ${!!token}`);
    console.log(`[Athena Debug] Practice ID: ${practiceId}`);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    console.log(`[Athena Debug] Search response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Athena Debug] Search error response: ${errorText}`);
      console.error(`[Athena Debug] Response headers:`, Object.fromEntries(response.headers.entries()));

      // Only treat 404 as "parameter not supported" - all other errors should be thrown
      if (response.status === 404) {
        console.log(`[Athena Debug] Parameter '${queryParamName}' returned 404, trying alternative`);
        return [];
      }

      // For 400 and other errors, provide detailed error information
      throw new Error(
        `Medication search failed (${queryParamName}): ${response.status} - ${errorText}`
      );
    }

    const data = (await response.json()) as MedicationSearchResponse | unknown[];
    const results = this.normalizeMedicationResults(data);

    if (results.length > 0) {
      console.log(
        `[Athena Debug] Medication search matched id(s): ${results.map((item) => item.medicationid).join(", ")}`
      );
    } else {
      console.log("[Athena Debug] Medication search returned no normalized matches");
      console.log("[Athena Debug] Raw medication search payload:", data);
    }

    return results;
  }

  private normalizeMedicationResults(
    data: MedicationSearchResponse | unknown[]
  ): MedicationSearchResult[] {
    const rawItems = this.getMedicationSearchItems(data);

    return rawItems
      .map((item) => this.normalizeMedicationResult(item))
      .filter((item): item is MedicationSearchResult => item !== null);
  }

  private getMedicationSearchItems(data: MedicationSearchResponse | unknown[]): unknown[] {
    if (Array.isArray(data)) {
      return data;
    }

    const candidateCollections = [
      data.medications,
      data.medication,
      data.items,
      data.results,
      data.result,
      data.medicationlist,
      data.medicationList,
      data.data,
    ];

    for (const collection of candidateCollections) {
      if (Array.isArray(collection)) {
        return collection;
      }
    }

    return [];
  }

  private normalizeMedicationResult(item: unknown): MedicationSearchResult | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const raw = item as Record<string, unknown>;
    const rawId =
      raw.medicationid ??
      raw.medicationId ??
      raw.medication_id ??
      raw.medicationID ??
      raw.id ??
      raw.referenceid ??
      raw.referenceId ??
      raw.medicationreferenceid ??
      raw.medicationReferenceId;
    const rawName =
      raw.medication ??
      raw.medicationname ??
      raw.medicationName ??
      raw.medication_name ??
      raw.name ??
      raw.description ??
      raw.displayname ??
      raw.displayName ??
      raw.medicationdescription ??
      raw.medicationDescription;

    const medicationid = Number(rawId);
    const medicationname = typeof rawName === "string" ? rawName.trim() : "";

    if (!Number.isFinite(medicationid) || !medicationname) {
      console.log("[Athena Debug] Skipping medication item that could not be normalized:", raw);
      return null;
    }

    const medicationdosage =
      typeof raw.medicationdosage === "string"
        ? raw.medicationdosage
        : typeof raw.medicationDosage === "string"
          ? raw.medicationDosage
          : undefined;

    const medicationroute =
      typeof raw.medicationroute === "string"
        ? raw.medicationroute
        : typeof raw.medicationRoute === "string"
          ? raw.medicationRoute
          : undefined;

    return {
      medicationid,
      medicationname,
      medicationdosage,
      medicationroute,
    };
  }

  /**
   * Test Athena connection by attempting to get an access token
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getAccessToken();
      return {
        success: true,
        message: `Connection successful! Token obtained (expires in ${Math.round((this.tokenExpiresAt - Date.now()) / 1000 / 60)} minutes)`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message,
      };
    }
  }

  /**
   * Add medication to patient's chart
   */
  async addMedicationToChart(
    practiceId: string,
    patientId: string,
    payload: AddMedicationPayload
  ): Promise<AddMedicationResponse> {
    try {
      const token = await this.getAccessToken();

      if (!practiceId) {
        throw new Error("Practice ID not provided");
      }

      const url = new URL(
        `/v1/${practiceId}/chart/${patientId}/medications`,
        this.baseUrl
      );

      console.log(
        `Adding medication ${payload.medicationid} to patient ${patientId}`
      );
      console.log(`[Athena Debug] POST URL: ${url.toString()}`);
      console.log("[Athena Debug] POST payload:", payload);
      console.log("[Athena Debug] Token present:", !!token);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Athena Debug] Add medication failed response body:", errorText);
        console.error("[Athena Debug] Add medication response headers:", Object.fromEntries(response.headers.entries()));

        // Attempt a fallback: some Athena preview endpoints expect form-encoded bodies
        // when they report missing fields for JSON input. Retry once with URLSearchParams.
        let shouldRetryWithForm = false;
        try {
          const parsed = JSON.parse(errorText);
          const missing = parsed && parsed.missingfields;
          if (Array.isArray(missing) && (missing.includes("medicationid") || missing.includes("departmentid"))) {
            shouldRetryWithForm = true;
          }
        } catch (e) {
          // ignore parse errors
        }

        if (shouldRetryWithForm) {
          console.log("[Athena Debug] Retrying add medication using form-encoded body due to missingfields response");
          const formBody = new URLSearchParams();
          formBody.append("medicationid", String(payload.medicationid));
          formBody.append("departmentid", String(payload.departmentid));
          formBody.append("startdate", String(payload.startdate));
          formBody.append("patientnote", String(payload.patientnote));

          const response2 = await fetch(url.toString(), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: formBody.toString(),
          });

          const errorText2 = !response2.ok ? await response2.text() : null;
          if (!response2.ok) {
            console.error("[Athena Debug] Retry (form-encoded) failed response body:", errorText2);
            console.error("[Athena Debug] Retry (form-encoded) response headers:", Object.fromEntries(response2.headers.entries()));
            throw new Error(
              `Add medication failed (form retry): ${response2.status} - ${errorText2}`
            );
          }

          const data2 = (await response2.json()) as AddMedicationResponse;
          console.log("Medication added successfully (form retry):", data2);
          return data2;
        }

        throw new Error(
          `Add medication failed: ${response.status} - ${errorText}`
        );
      }

      const data = (await response.json()) as AddMedicationResponse;
      console.log("Medication added successfully:", data);
      return data;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to add medication to chart: ${message}`);
    }
  }

  /**
   * Process transcribed text to extract medication and add to chart
   * @deprecated This function is legacy. Use searchMedications and addMedicationToChart separately.
   */
  async processPrescription(
    practiceId: string,
    patientId: string,
    transcribedText: string,
    departmentId: number,
    startDate: string,
    medicationName: string
  ): Promise<AddMedicationResponse> {
    try {
      // Search for medication
      const medications = await this.searchMedications(practiceId, medicationName);

      if (medications.length === 0) {
        throw new Error(`Medication "${medicationName}" not found in database`);
      }

      // Use first result (most relevant)
      const medication = medications[0];

      // Add to patient chart
      const payload: AddMedicationPayload = {
        medicationid: medication.medicationid,
        departmentid: departmentId,
        startdate: startDate,
        patientnote: transcribedText,
      };

      return await this.addMedicationToChart(practiceId, patientId, payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to process prescription: ${message}`);
    }
  }
}

// Export singleton instance
export const athenaHealthAPI = new AthenaHealthAPI();
export type {
  MedicationSearchResult,
  AddMedicationPayload,
  AddMedicationResponse,
};
