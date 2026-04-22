export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate Google login URL at runtime
export const getLoginUrl = () => {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  
  if (!googleClientId) {
    console.error("VITE_GOOGLE_CLIENT_ID is not defined");
    return "#error-missing-google-client-id";
  }

  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";
  const options = {
    redirect_uri: redirectUri,
    client_id: googleClientId,
    access_type: "offline",
    response_type: "code",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
  };

  const qs = new URLSearchParams(options);
  return `${rootUrl}?${qs.toString()}`;
};
