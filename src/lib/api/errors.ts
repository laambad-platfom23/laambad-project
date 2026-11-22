export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Err = {
  invalidJSON: () => new ApiError(400, "invalid_json", "invalid request body"),
  invalidInput: (msg = "invalid input") => new ApiError(400, "invalid_input", msg),
  unauthorized: () => new ApiError(401, "unauthorized", "authentication required"),
  forbidden: () => new ApiError(403, "forbidden", "insufficient permissions"),
  notFound: (msg = "not found") => new ApiError(404, "not_found", msg),
  conflict: (code: string, msg: string) => new ApiError(409, code, msg),
  emailTaken: () => new ApiError(409, "email_taken", "email already registered"),
  usernameTaken: () => new ApiError(409, "username_taken", "username already taken"),
  invalidCredentials: () => new ApiError(401, "invalid_credentials", "invalid email or password"),
  accountDisabled: () => new ApiError(403, "account_disabled", "account is disabled"),
  invalidToken: () => new ApiError(401, "invalid_token", "invalid or expired token"),
  refreshRevoked: () => new ApiError(401, "refresh_token_revoked", "refresh token revoked"),
  weakPassword: () => new ApiError(400, "weak_password", "password must be at least 8 characters"),
  paymentRequired: () => new ApiError(402, "payment_required", "payment required to enroll"),
  alreadyEnrolled: () => new ApiError(409, "already_enrolled", "already enrolled in this course"),
};
