export const ENV = {
  appId: process.env.VITE_APP_ID ?? "app_73e4e774dcd4ca53",
  cookieSecret: process.env.JWT_SECRET ?? "0c5ab29a90ddd2184b308f954048851cb74ceb6023d5336dbdca339d0bef12f1",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "https://api.manus.im",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
