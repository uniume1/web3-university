import { db } from "@web3-school/db"
import { courses, courseSections } from "@web3-school/db/schema/core"
import { TRPCError } from "@trpc/server"
import { and, asc, eq, ilike } from "drizzle-orm"
import { z } from "zod"

import { publicProcedure, router } from "../index"

export const coursesRouter = router({
  list: publicProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
        keyword: z.string().trim().max(80).optional(),
      }),
    )
    .query(async ({ input }) => {
      const where = and(
        eq(courses.status, "active"),
        input.keyword ? ilike(courses.title, `%${input.keyword}%`) : undefined,
      )

      return db
        .select({
          id: courses.id,
          chainCourseId: courses.chainCourseId,
          title: courses.title,
          description: courses.description,
          coverUrl: courses.coverUrl,
          priceYd: courses.priceYd,
        })
        .from(courses)
        .where(where)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
    }),

  detail: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [course] = await db
        .select({
          id: courses.id,
          chainCourseId: courses.chainCourseId,
          title: courses.title,
          description: courses.description,
          coverUrl: courses.coverUrl,
          priceYd: courses.priceYd,
        })
        .from(courses)
        .where(and(eq(courses.id, input.id), eq(courses.status, "active")))
        .limit(1)

      if (!course) throw new TRPCError({ code: "NOT_FOUND" })

      const sections = await db
        .select({
          id: courseSections.id,
          title: courseSections.title,
          sortOrder: courseSections.sortOrder,
          durationSeconds: courseSections.durationSeconds,
          required: courseSections.required,
        })
        .from(courseSections)
        .where(eq(courseSections.courseId, course.id))
        .orderBy(asc(courseSections.sortOrder))

      return { ...course, sections }
    }),
})
