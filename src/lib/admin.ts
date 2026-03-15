// Admin authentication utilities (client-side)

/** Get admin token from sessionStorage, or null if not admin */
export function getAdminToken(): string | null {
  try {
    const token = sessionStorage.getItem("cpuagen-admin-token");
    if (token) {
      const decoded = atob(token);
      if (decoded.startsWith("wforeman:")) {
        return token;
      }
    }
  } catch {
    // not in browser or not admin
  }
  return null;
}

/** Check if current session is admin */
export function isAdminSession(): boolean {
  return getAdminToken() !== null;
}

/** Inject admin token into a chat API request body if admin session is active */
export function withAdminToken(body: Record<string, unknown>): Record<string, unknown> {
  const token = getAdminToken();
  if (token) {
    return { ...body, adminToken: token };
  }
  return body;
}
