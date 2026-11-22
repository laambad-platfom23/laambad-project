import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

/** Empty = same-origin Next.js Route Handlers (`/api/...`). Override for external API. */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Only send users to /login when their session died on a page that requires auth (not marketing /). */
function shouldRedirectToLoginAfterSessionExpired(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  const requiresAuth =
    p === "/dashboard" ||
    p.startsWith("/dashboard/") ||
    p === "/learn" ||
    p.startsWith("/learn/");
  return requiresAuth;
}

const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── Request interceptor: attach JWT ──
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    // FormData must set its own multipart boundary — drop default JSON content-type.
    if (typeof FormData !== "undefined" && config.data instanceof FormData && config.headers) {
      delete config.headers["Content-Type"];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: auto-refresh on 401 ──
let isRefreshing = false;
let failedQueue: {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}[] = [];

const processQueue = (error: AxiosError | null, token: string | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== "undefined"
          ? localStorage.getItem("refresh_token")
          : null;

      if (!refreshToken) {
        isRefreshing = false;
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          if (shouldRedirectToLoginAfterSessionExpired()) {
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const newAccessToken = data.access_token || data.token;
        localStorage.setItem("access_token", newAccessToken);
        if (data.refresh_token) {
          localStorage.setItem("refresh_token", data.refresh_token);
        }

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }

        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null);
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        if (typeof window !== "undefined" && shouldRedirectToLoginAfterSessionExpired()) {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // student tried to buy / learn before verifying the e-mail → send them to the code page, then back
    const code = (error.response?.data as { error?: { code?: string }; code?: string } | undefined);
    if (
      error.response?.status === 403 &&
      (code?.error?.code ?? code?.code) === "email_not_verified" &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/verify-email")
    ) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/verify-email?next=${encodeURIComponent(next)}`;
    }

    return Promise.reject(error);
  }
);

export default apiClient;
