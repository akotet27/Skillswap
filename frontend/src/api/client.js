/**
 * Thin fetch wrapper: attaches the access token, and on a 401 transparently
 * tries one refresh-token rotation before retrying the original request
 * once. If the refresh itself fails, it clears stored tokens and lets the
 * 401 propagate so the caller can redirect to /login.
 *
 * Tokens live in localStorage (not cookies) since the backend is a plain
 * JSON API with no server-rendered pages to protect from CSRF the way a
 * cookie session would need -- the access token is short-lived (15 min)
 * and the refresh token is rotated on every use (see backend
 * app/services/auth_service.py), which is the mitigation for XSS-stolen
 * refresh tokens in this design.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

let refreshPromise = null;

function getTokens() {
  return {
    access: localStorage.getItem("skillswap-access-token"),
    refresh: localStorage.getItem("skillswap-refresh-token"),
  };
}

export function setTokens(access, refresh) {
  localStorage.setItem("skillswap-access-token", access);
  localStorage.setItem("skillswap-refresh-token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("skillswap-access-token");
  localStorage.removeItem("skillswap-refresh-token");
}

async function doRefresh() {
  const { refresh } = getTokens();
  if (!refresh) throw new Error("No refresh token");

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    throw new Error("Refresh failed");
  }
  const data = await res.json();
  setTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

/** Deduplicates concurrent refresh attempts -- several requests failing
 * with 401 at once should trigger exactly one /auth/refresh call. */
function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch(path, options = {}) {
  const { access } = getTokens();
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (access) headers["Authorization"] = `Bearer ${access}`;

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && getTokens().refresh) {
    try {
      const newAccess = await refreshOnce();
      const retryHeaders = { ...headers, Authorization: `Bearer ${newAccess}` };
      res = await fetch(`${API_BASE}${path}`, { ...options, headers: retryHeaders });
    } catch {
      // fall through with the original 401 response
    }
  }
  return res;
}

// FastAPI/Pydantic validation failures (422s) come back as
// `detail: [{type, loc, msg, input, ...}]`, not a plain string -- every
// other error we raise ourselves is already a human sentence
// (`HTTPException(status, "...")`), but this one shape is raw developer
// output. Turn it into plain text instead of showing users things like
// `[{"type":"value_error","loc":["body"],"msg":"Value error, end_time
// must be after start_time",...}]`, which is what used to reach the
// screen verbatim.
function describeErrorDetail(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg.replace(/^Value error,\s*/, "") : null))
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  return null;
}

function describeStatus(status) {
  if (status >= 500) return "Something went wrong on our end. Please try again in a moment.";
  if (status === 404) return "We couldn't find that.";
  if (status === 403) return "You don't have permission to do that.";
  return "Something went wrong. Please try again.";
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body (e.g. 204)
  }
  if (!res.ok) {
    const message = describeErrorDetail(body?.detail) || body?.message || describeStatus(res.status);
    throw new Error(message);
  }
  return body;
}

export { API_BASE };
