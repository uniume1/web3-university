import { TRPCError } from "@trpc/server";
import { db } from "@web3-school/db";
import { courses, teachers } from "@web3-school/db/schema/core";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { roleProcedure, router } from "../index";

const draftInput = z.object({
	title: z.string().trim().min(1).max(120),
	description: z.string().trim().min(1).max(10_000),
	coverUrl: z.string().url(),
	priceYd: z.string().regex(/^\d+$/),
});

async function requireTeacher(userId: string) {
	const [teacher] = await db
		.select()
		.from(teachers)
		.where(and(eq(teachers.userId, userId), eq(teachers.approved, true)))
		.limit(1);
	if (!teacher) throw new TRPCError({ code: "FORBIDDEN" });
	return teacher;
}

export const managementRouter = router({
	createDraft: roleProcedure(["teacher"])
		.input(draftInput)
		.mutation(async ({ ctx, input }) => {
			const teacher = await requireTeacher(ctx.user.id);
			const [course] = await db
				.insert(courses)
				.values({ ...input, teacherId: teacher.id, status: "draft" })
				.returning();
			return course;
		}),

	submitForReview: roleProcedure(["teacher"])
		.input(z.object({ courseId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const teacher = await requireTeacher(ctx.user.id);
			const [course] = await db
				.update(courses)
				.set({ status: "pending_review", updatedAt: new Date() })
				.where(
					and(
						eq(courses.id, input.courseId),
						eq(courses.teacherId, teacher.id),
						eq(courses.status, "draft"),
					),
				)
				.returning();
			if (!course) throw new TRPCError({ code: "BAD_REQUEST" });
			return course;
		}),

	approve: roleProcedure(["operator", "admin"])
		.input(z.object({ courseId: z.string().uuid() }))
		.mutation(async ({ input }) => {
			const [course] = await db
				.update(courses)
				.set({ status: "pending_chain", updatedAt: new Date() })
				.where(
					and(
						eq(courses.id, input.courseId),
						eq(courses.status, "pending_review"),
					),
				)
				.returning();
			if (!course) throw new TRPCError({ code: "BAD_REQUEST" });
			return course;
		}),

	reject: roleProcedure(["operator", "admin"])
		.input(z.object({ courseId: z.string().uuid() }))
		.mutation(async ({ input }) => {
			const [course] = await db
				.update(courses)
				.set({ status: "rejected", updatedAt: new Date() })
				.where(
					and(
						eq(courses.id, input.courseId),
						eq(courses.status, "pending_review"),
					),
				)
				.returning();
			if (!course) throw new TRPCError({ code: "BAD_REQUEST" });
			return course;
		}),
});
