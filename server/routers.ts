import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as db from "./db";
import { users, projects, tasks, annotations, qaReviews, statistics, notifications } from "../drizzle/schema";

// Helper to ensure admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Admin procedures for user management
  admin: router({
    // Get all users
    getAllUsers: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // Get user by ID
    getUser: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getUserById(input.id);
    }),

    // Create new user (local, not OAuth)
    createUser: adminProcedure
      .input(
        z.object({
          name: z.string(),
          email: z.string().email(),
          role: z.enum(["admin", "tasker", "qa", "user"]),
          openId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        try {
          await drizzleDb.insert(users).values({
            openId: input.openId,
            name: input.name,
            email: input.email,
            role: input.role,
            isActive: true,
          });

          const result = await db.getUserByOpenId(input.openId);
          return result;
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
        }
      }),

    // Update user
    updateUser: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          email: z.string().email().optional(),
          role: z.enum(["admin", "tasker", "qa", "user"]).optional(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const updates: any = {};
        if (input.name) updates.name = input.name;
        if (input.email) updates.email = input.email;
        if (input.role) updates.role = input.role;
        if (input.isActive !== undefined) updates.isActive = input.isActive;

        try {
          await drizzleDb.update(users).set(updates).where(eq(users.id, input.id));
          return await db.getUserById(input.id);
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update user" });
        }
      }),

    // Delete user
    deleteUser: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const drizzleDb = await db.getDb();
      if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      try {
        await drizzleDb.delete(users).where(eq(users.id, input.id));
        return { success: true };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to delete user" });
      }
    }),
  }),

  // Project procedures
  projects: router({
    // Get all projects
    getAll: protectedProcedure.query(async () => {
      return await db.getAllProjects();
    }),

    // Get project by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getProjectById(input.id);
    }),

    // Create project (admin only)
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          labelStudioProjectId: z.number(),
          totalItems: z.number().default(0),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const drizzleDb = await db.getDb();
        if (!drizzleDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        try {
          await drizzleDb.insert(projects).values({
            name: input.name,
            description: input.description,
            labelStudioProjectId: input.labelStudioProjectId,
            totalItems: input.totalItems,
            createdBy: ctx.user.id,
          });

          return await db.getProjectById(input.labelStudioProjectId);
        } catch (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create project" });
        }
      }),
  }),

  // Task procedures
  tasks: router({
    // Get tasks for a project
    getByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getTasksByProject(input.projectId);
      }),

    // Get task by ID
    getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return await db.getTaskById(input.id);
    }),
  }),

  // Statistics procedures
  statistics: router({
    // Get project statistics
    getProjectStats: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        return await db.getStatisticsByProject(input.projectId);
      }),
  }),

  // Notifications procedures
  notifications: router({
    // Get user notifications
    getByUser: protectedProcedure.query(async ({ ctx }) => {
      return await db.getNotificationsByUser(ctx.user.id);
    }),
  }),

  // Tasker procedures
  tasker: router({
    // Get tasks assigned to tasker
    getTasks: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTasksByAssignee(ctx.user.id);
    }),

    // Get tasker statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "tasker") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getTaskerStats(ctx.user.id);
    }),
  }),

  // QA procedures
  qa: router({
    // Get QA queue
    getQueue: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "qa") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getQAQueue(ctx.user.id);
    }),

    // Get QA statistics
    getStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "qa") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getQAStats(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
