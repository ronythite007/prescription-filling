type AthenaTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

type NetlifyHandlerEvent = {
  httpMethod?: string;
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

export async function handler(event: NetlifyHandlerEvent): Promise<NetlifyHandlerResponse> {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  const clientId = getEnvValue("ATHENA_CLIENT_ID", "VITE_ATHENA_CLIENT_ID");
  const clientSecret = getEnvValue("ATHENA_CLIENT_SECRET", "VITE_ATHENA_CLIENT_SECRET");
  const tokenUrl = getEnvValue("ATHENA_TOKEN_URL", "VITE_ATHENA_TOKEN_URL");
  const tokenScope = getEnvValue("ATHENA_SCOPE", "VITE_ATHENA_SCOPE");

  if (!clientId || !clientSecret || !tokenUrl) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Athena Health credentials are not configured." }),
    };
  }

  const requestBody = new URLSearchParams({
    grant_type: "client_credentials",
  });

  if (tokenScope) {
    requestBody.append("scope", tokenScope);
  }

  const authHeader = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: requestBody.toString(),
  });

  const responseText = await response.text();

  return {
    statusCode: response.ok ? 200 : response.status,
    headers,
    body: response.ok
      ? responseText
      : JSON.stringify({
          error: "Athena token request failed.",
          status: response.status,
          details: responseText,
        }),
  };
}