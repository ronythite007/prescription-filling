type AthenaTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

type AthenaSearchRequest = {
  action: "search";
  practiceId: string;
  medicationName: string;
  queryParamName: "name" | "searchvalue";
};

type AthenaAddRequest = {
  action: "add";
  practiceId: string;
  patientId: string;
  payload: {
    medicationid: number;
    departmentid: number;
    startdate: string;
    patientnote: string;
  };
};

type AthenaProxyRequest = AthenaSearchRequest | AthenaAddRequest;

type NetlifyHandlerEvent = {
  httpMethod?: string;
  body?: string | null;
};

type NetlifyHandlerResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

const runtimeEnv = (globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
  };
}).process?.env ?? {};

function getEnvValue(...keys: string[]): string {
  for (const key of keys) {
    const value = runtimeEnv[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function base64Encode(value: string): string {
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from(input: string): { toString(encoding: string): string } };
  }).Buffer;

  if (bufferCtor) {
    return bufferCtor.from(value).toString("base64");
  }

  return btoa(value);
}

function createResponse(statusCode: number, body: unknown): NetlifyHandlerResponse {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function getAthenaAccessToken(): Promise<string> {
  const clientId = getEnvValue("ATHENA_CLIENT_ID", "VITE_ATHENA_CLIENT_ID");
  const clientSecret = getEnvValue("ATHENA_CLIENT_SECRET", "VITE_ATHENA_CLIENT_SECRET");
  const tokenUrl = getEnvValue("ATHENA_TOKEN_URL", "VITE_ATHENA_TOKEN_URL");
  const tokenScope = getEnvValue("ATHENA_SCOPE", "VITE_ATHENA_SCOPE");

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error("Athena Health credentials are not configured.");
  }

  const requestBody = new URLSearchParams({
    grant_type: "client_credentials",
  });

  if (tokenScope) {
    requestBody.append("scope", tokenScope);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64Encode(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: requestBody.toString(),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        error: "Athena token request failed.",
        status: response.status,
        details: responseText,
      })
    );
  }

  const data = JSON.parse(responseText) as AthenaTokenResponse;
  return data.access_token;
}

async function handleSearch(request: AthenaSearchRequest): Promise<NetlifyHandlerResponse> {
  const token = await getAthenaAccessToken();
  const baseUrl = getEnvValue("ATHENA_BASE_URL", "VITE_ATHENA_BASE_URL");

  if (!baseUrl) {
    return createResponse(500, { error: "Athena base URL is not configured." });
  }

  const url = new URL(`/v1/${request.practiceId}/reference/medications`, baseUrl);
  url.searchParams.append(request.queryParamName, request.medicationName);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    return createResponse(response.status, {
      error: "Athena medication search failed.",
      status: response.status,
      details: responseText,
    });
  }

  try {
    return createResponse(200, JSON.parse(responseText));
  } catch {
    return createResponse(200, responseText);
  }
}

async function sendAthenaAddRequest(
  url: string,
  token: string,
  contentType: string,
  body: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      Accept: "application/json",
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function handleAdd(request: AthenaAddRequest): Promise<NetlifyHandlerResponse> {
  const token = await getAthenaAccessToken();
  const baseUrl = getEnvValue("ATHENA_BASE_URL", "VITE_ATHENA_BASE_URL");

  if (!baseUrl) {
    return createResponse(500, { error: "Athena base URL is not configured." });
  }

  const url = new URL(`/v1/${request.practiceId}/chart/${request.patientId}/medications`, baseUrl);

  const firstAttempt = await sendAthenaAddRequest(
    url.toString(),
    token,
    "application/json",
    JSON.stringify(request.payload)
  );

  if (firstAttempt.ok) {
    try {
      return createResponse(200, JSON.parse(firstAttempt.text));
    } catch {
      return createResponse(200, firstAttempt.text);
    }
  }

  let shouldRetryWithForm = false;
  try {
    const parsed = JSON.parse(firstAttempt.text) as { missingfields?: string[] };
    const missing = parsed?.missingfields;
    if (Array.isArray(missing) && (missing.includes("medicationid") || missing.includes("departmentid"))) {
      shouldRetryWithForm = true;
    }
  } catch {
    // ignore parse errors
  }

  if (shouldRetryWithForm) {
    const formBody = new URLSearchParams();
    formBody.append("medicationid", String(request.payload.medicationid));
    formBody.append("departmentid", String(request.payload.departmentid));
    formBody.append("startdate", String(request.payload.startdate));
    formBody.append("patientnote", String(request.payload.patientnote));

    const secondAttempt = await sendAthenaAddRequest(
      url.toString(),
      token,
      "application/x-www-form-urlencoded",
      formBody.toString()
    );

    if (secondAttempt.ok) {
      try {
        return createResponse(200, JSON.parse(secondAttempt.text));
      } catch {
        return createResponse(200, secondAttempt.text);
      }
    }

    return createResponse(secondAttempt.status, {
      error: "Athena medication add failed.",
      status: secondAttempt.status,
      details: secondAttempt.text,
    });
  }

  return createResponse(firstAttempt.status, {
    error: "Athena medication add failed.",
    status: firstAttempt.status,
    details: firstAttempt.text,
  });
}

export async function handler(event: NetlifyHandlerEvent): Promise<NetlifyHandlerResponse> {
  if (event.httpMethod === "OPTIONS") {
    return createResponse(204, "");
  }

  if (event.httpMethod !== "POST") {
    return createResponse(405, { error: "Method not allowed." });
  }

  if (!event.body) {
    return createResponse(400, { error: "Missing request body." });
  }

  let payload: AthenaProxyRequest;
  try {
    payload = JSON.parse(event.body) as AthenaProxyRequest;
  } catch {
    return createResponse(400, { error: "Invalid JSON body." });
  }

  try {
    if (payload.action === "search") {
      return await handleSearch(payload);
    }

    return await handleAdd(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return createResponse(500, { error: message });
  }
}
