const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json();
}

export async function checkApiHealth() {
  try {
    const data = await request("/api/health");
    return data?.ok === true;
  } catch {
    return false;
  }
}

export async function fetchBootstrap() {
  return request("/api/bootstrap");
}

export async function saveProfileApi(profile) {
  const { profile: saved } = await request("/api/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
  return saved;
}

export async function saveClientsApi(clients) {
  const { clients: saved } = await request("/api/clients", {
    method: "PUT",
    body: JSON.stringify(clients),
  });
  return saved;
}

export async function saveQuotesApi(quotes) {
  const { quotes: saved } = await request("/api/quotes", {
    method: "PUT",
    body: JSON.stringify(quotes),
  });
  return saved;
}
