export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  if (!oauthPortalUrl) {
    console.error("VITE_OAUTH_PORTAL_URL is not defined");
    return "#error-missing-oauth-url";
  }

  let url: URL;
  try {
    url = new URL(`${oauthPortalUrl}/app-auth`);
  } catch (e) {
    console.error("Invalid VITE_OAUTH_PORTAL_URL:", oauthPortalUrl);
    return "#error-invalid-oauth-url";
  }
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
