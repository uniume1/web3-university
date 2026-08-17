import { db } from "@web3-school/db"
import { courseSections } from "@web3-school/db/schema/core"
import { learningProgress, purchases } from "@web3-school/db/schema/learning"
import { TRPCError } from "@trpc/server"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { protectedProcedure, router } from "../index"

async function requirePurchase(userId: string, courseId: string) {
  const [purchase] = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .limit(1)
  if (!purchase) throw new TRPCError({ code: "FORBIDDEN" })
}

export const learningRouter = router({
  getCourse: protectedProcedure
    .input(z.object({ courseId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await requirePurchase(ctx.user.id, input.courseId)
      return db
        .select()
        .from(courseSections)
        .where(eq(courseSections.courseId, input.courseId))
        .orderBy(asc(courseSections.sortOrder))
    }),

  updateProgress: protectedProcedure
    .input(
      z.object({
        courseId: z.string().uuid(),
        progress: z.number().int().min(0).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePurchase(ctx.user.id, input.courseId)
      const [current] = await db
        .select()
        .from(learningProgress)
        .where(
          and(
            eq(learningProgress.userId, ctx.user.id),
            eq(learningProgress.courseId, input.courseId),
          ),
        )
        .limit(1)
      if (!current) throw new TRPCError({ code: "NOT_FOUND" })

      const progressPercent = Math.max(current.progressPercent, input.progress)
      const completed =
        progressPercent >= 90 &&
        (current.quizScore === null || current.quizScore >= 60)

      const [updated] = await db
        .update(learningProgress)
        .set({
          progressPercent,
          status: completed ? "completed" : "learning",
          completedAt: completed ? (current.completedAt ?? new Date()) : null,
          updatedAt: new Date(),
        })
        .where(eq(learningProgress.id, current.id))
        .returning()
      return updated
    }),
})
