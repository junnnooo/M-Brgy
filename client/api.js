// Thin wrapper around the kaBRGY Express API. Keeps the login tokens in localStorage.
const API_URL = location.port === "5173" ? "http://localhost:3000/api" : "/api";
const ACCESS_KEY = "kabrgy_access_token";
const REFRESH_KEY = "kabrgy_refresh_token";

const api = {
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
  onAuthLost: null, // set by the app: called when the session can't be renewed

  setTokens({ access_token, refresh_token }) {
    this.accessToken = access_token;
    this.refreshToken = refresh_token;
    localStorage.setItem(ACCESS_KEY, access_token);
    localStorage.setItem(REFRESH_KEY, refresh_token);
  },

  clearTokens() {
    this.accessToken = this.refreshToken = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },

  async refresh() {
    if (!this.refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      if (!res.ok) throw new Error("refresh failed");
      this.setTokens(await res.json());
      return true;
    } catch (e) {
      this.clearTokens();
      if (this.onAuthLost) this.onAuthLost();
      return false;
    }
  },

  async request(path, { method = "GET", body, retry = true } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    let res;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error("Can't reach the server. Is it running on port 3000?");
    }

    // Expired access token: renew once and retry
    if (res.status === 401 && retry && !path.startsWith("/auth/") && (await this.refresh())) {
      return this.request(path, { method, body, retry: false });
    }

    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path) { return this.request(path); },
  post(path, body = {}) { return this.request(path, { method: "POST", body }); },
  patch(path, body = {}) { return this.request(path, { method: "PATCH", body }); },
  del(path) { return this.request(path, { method: "DELETE" }); },
};
