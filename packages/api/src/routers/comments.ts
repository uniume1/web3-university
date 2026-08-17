import { db } from "@web3-school/db"
import { comments, purchases } from "@web3-school/db/schema/learning"
import { TRPCError } from "@trpc/server"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { protectedProcedure, publicProcedure, router } from "../index"

export const commentsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(({ input }) =>
      db
        .select()
        .from(comments)
        .where(eq(comments.courseId, input.courseId))
        .orderBy(desc(comments.createdAt))
        .limit(input.limit),
    ),

  create: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [purchase] = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(
          and(
            eq(purchases.userId, ctx.user.id),
            eq(purchases.courseId, input.courseId),
          ),
        )
        .limit(1)
      if (!purchase) throw new TRPCError({ code: "FORBIDDEN" })

      const [comment] = await db
        .insert(comments)
        .values({ ...input, userId: ctx.user.id })
        .returning()
      return comment
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await db
        .delete(comments)
        .where(and(eq(comments.id, input.id), eq(comments.userId, ctx.user.id)))
        .returning()
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" })
      return { deleted: true }
    }),
})
