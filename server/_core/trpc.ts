/**
 * tRPC core — v4
 * ───────────────
 * Defines all reusable procedure types:
 *   publicProcedure      — no auth required
 *   protectedProcedure   — any authenticated user
 *   adminProcedure       — admin only
 *   managerProcedure     — admin OR manager
 *   qaProcedure          — admin, manager, OR qa
 *   taskerProcedure      — admin, manager, OR tasker
 */

import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ─── require any authenticated user ──────────────────────────────────────────
const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

// ─── admin only ───────────────────────────────────────────────────────────────
export const adminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
);

// ─── admin OR manager ─────────────────────────────────────────────────────────
export const managerProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "manager")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Manager access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
);

// ─── admin, manager, or qa ────────────────────────────────────────────────────
export const qaProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const allowed = ["admin", "manager", "qa"];
    if (!ctx.user || !allowed.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "QA access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
);

// ─── admin, manager, or tasker ────────────────────────────────────────────────
export const taskerProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const allowed = ["admin", "manager", "tasker"];
    if (!ctx.user || !allowed.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Worker access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
);
