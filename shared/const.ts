export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// v4 role hierarchy
export const ROLES = ["user", "tasker", "qa", "manager", "admin"] as const;
export type Role = typeof ROLES[number];

// Skip rate-limit: max 3 skips per user per project per hour
export const SKIP_RATE_LIMIT = 3;
export const SKIP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
