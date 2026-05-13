import fs from "fs";
import path from "path";

// Manually parse .env file
function loadEnv() {
  const envPath = new URL(".env", import.meta.url);
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  content.split("\n").forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  });
  return env;
}

const envVars = loadEnv();
const clientId = envVars.VITE_ATHENA_CLIENT_ID;
const clientSecret = envVars.VITE_ATHENA_CLIENT_SECRET;
const tokenUrl = envVars.VITE_ATHENA_TOKEN_URL;

console.log("🔍 Athena Health Token Test");
console.log("================================");
console.log(`Client ID: ${clientId ? clientId.substring(0, 10) + "..." : "NOT SET"}`);
console.log(`Client Secret: ${clientSecret ? "SET (hidden)" : "NOT SET"}`);
console.log(`Token URL: ${tokenUrl}`);
console.log("================================\n");

if (!clientId || !clientSecret) {
  console.error("❌ Missing credentials in .env file");
  process.exit(1);
}

const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

console.log("📤 Sending token request...\n");

fetch(tokenUrl, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
})
  .then((res) => {
    console.log(`Status: ${res.status} ${res.statusText}`);
    return res.json();
  })
  .then((data) => {
    if (data.access_token) {
      console.log("✅ SUCCESS! Token obtained:\n");
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log("❌ ERROR:\n");
      console.log(JSON.stringify(data, null, 2));
    }
  })
  .catch((err) => {
    console.log("❌ FETCH ERROR:\n");
    console.log(err.message);
  });
