const API_BASE = import.meta.env.VITE_API_BASE || "";

function buildUrl(base, params) {
  if (!base) {
    throw new Error("VITE_API_BASE is missing. Set it in your .env file.");
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${new URLSearchParams(params).toString()}`;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Invalid JSON response from server.");
  }
}

export async function fetchEligible() {
  const url = buildUrl(API_BASE, { action: "FETCH_ELIGIBLE" });
  const response = await fetch(url, { method: "GET" });
  const payload = await parseJsonResponse(response);

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Failed to fetch eligible orders.");
  }

  return payload.data || [];
}

async function postJson(body) {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE is missing. Set it in your .env file.");
  }

  const response = await fetch(API_BASE, {
    method: "POST",
    headers: {
      // Use a simple content-type to avoid CORS preflight with Apps Script.
      "Content-Type": "text/plain"
    },
    body: JSON.stringify(body)
  });

  const payload = await parseJsonResponse(response);

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

export function uploadFinal(orderId, files) {
  return postJson({
    action: "UPLOAD_FINAL",
    orderId,
    files
  });
}

export function uploadAdditional(orderId, additionalUrl, files) {
  return postJson({
    action: "UPLOAD_ADDITIONAL",
    orderId,
    additionalUrl,
    files
  });
}
