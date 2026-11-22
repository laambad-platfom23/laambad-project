import apiClient from "./client";
import type { LoginRequest, RegisterRequest, TokenResponse, User } from "@/types";

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<TokenResponse>("/api/auth/login", data),

  register: (data: RegisterRequest) =>
    apiClient.post<TokenResponse>("/api/auth/register", data),

  refresh: (refreshToken: string) =>
    apiClient.post<TokenResponse>("/api/auth/refresh", { refresh_token: refreshToken }),

  logout: () => {
    if (typeof window === "undefined") {
      return Promise.resolve({ data: undefined } as { data: undefined });
    }
    const refresh_token = localStorage.getItem("refresh_token");
    if (!refresh_token) {
      return Promise.resolve({ data: undefined } as { data: undefined });
    }
    return apiClient.post("/api/auth/logout", { refresh_token });
  },

  me: () => apiClient.get<User>("/api/v1/me"),

  /** Sends a reset code to the e-mail (same answer whether or not the account exists). */
  forgotPassword: (email: string) =>
    apiClient.post<{ ok: boolean; message: string }>("/api/auth/forgot-password", { email }),

  resetPassword: (data: { email: string; code: string; password: string }) =>
    apiClient.post<{ ok: boolean }>("/api/auth/reset-password", data),

  /** Signed-in user: e-mail a verification code. */
  sendVerificationCode: () =>
    apiClient.post<{ ok: boolean; already_verified: boolean }>("/api/v1/me/verify-email/send", {}),

  verifyEmail: (code: string) =>
    apiClient.post<{ ok: boolean; email_verified: boolean }>("/api/v1/me/verify-email", { code }),

  /** Update the signed-in user's own profile (name, phone, avatar). */
  updateMe: (data: { name?: string; phone?: string; avatar_url?: string }) =>
    apiClient.patch<User>("/api/v1/me", data),
};
