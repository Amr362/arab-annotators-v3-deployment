export const ENV = {
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  cookieSecret: process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_DIRECT_URL || "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  // Admin bootstrap: set these env vars to auto-create the first admin account
  adminEmail: process.env.ADMIN_EMAIL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  adminName: process.env.ADMIN_NAME ?? "",
};

// Validate critical environment variables
if (process.env.NODE_ENV === "production") {
  if (!ENV.databaseUrl) {
    console.warn("[Env] WARNING: DATABASE_URL is not set. Database operations will fail.");
  }
  if (!ENV.cookieSecret) {
    console.warn("[Env] WARNING: JWT_SECRET or SESSION_SECRET is not set. Session management may fail.");
  }
}
