import { OAuth2Client } from "google-auth-library";
import { ENV } from "./env";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { ForbiddenError } from "@shared/_core/errors";
import * as db from "../db";
import type { User } from "../../drizzle/schema";

const googleClient = new OAuth2Client(
  ENV.googleClientId,
  ENV.googleClientSecret
);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const sdk = {
  async exchangeCodeForToken(code: string, redirectUri: string) {
    const { tokens } = await googleClient.getToken({
      code,
      redirect_uri: redirectUri,
    });
    return tokens;
  },

  async getUserInfo(idToken: string) {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: ENV.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload) throw new Error("Failed to get user info from Google");
    
    return {
      openId: payload.sub,
      name: payload.name || payload.given_name || "User",
      email: payload.email,
      avatar: payload.picture,
    };
  },

  async createSessionToken(openId: string, options: { name?: string } = {}) {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    return await new SignJWT({ 
      openId, 
      name: options.name || "",
      appId: "google-auth" // Placeholder for compatibility
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1y")
      .sign(secret);
  },

  async verifySession(token: string | undefined | null) {
    if (!token) return null;
    try {
      const secret = new TextEncoder().encode(ENV.cookieSecret);
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
      });
      const { openId, name } = payload as Record<string, unknown>;

      if (!isNonEmptyString(openId)) return null;

      return {
        openId,
        name: (name as string) || "",
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  },

  privateParseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  },

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = this.privateParseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserByOpenId(session.openId);
    if (!user) {
      throw ForbiddenError("User not found");
    }

    await db.upsertUser({
      openId: user.openId,
      lastSignedIn: new Date(),
    });

    return user;
  },
};
