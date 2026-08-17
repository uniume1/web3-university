import dotenv from "dotenv";

dotenv.config({
	path: new URL("../../../apps/server/.env", import.meta.url),
});

if (process.env.NODE_ENV === "production") {
	throw new Error("Refusing to seed the production database");
}

const [{ db }, { courses, teachers, users }] = await Promise.all([
	import("./index"),
	import("./schema"),
]);

const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEV_TEACHER_ID = "00000000-0000-4000-8000-000000000002";
const DEV_COURSE_ID = "00000000-0000-4000-8000-000000000003";

await db.transaction(async (tx) => {
	await tx
		.insert(users)
		.values({
			id: DEV_USER_ID,
			privyUserId: "dev-teacher-user",
			walletAddress: "0x0000000000000000000000000000000000000001",
			username: "dev_teacher",
			usernameNormalized: "dev_teacher",
			role: "teacher",
		})
		.onConflictDoNothing();

	await tx
		.insert(teachers)
		.values({
			id: DEV_TEACHER_ID,
			userId: DEV_USER_ID,
			displayName: "Development Teacher",
			bio: "Local development seed teacher",
			approved: true,
		})
		.onConflictDoNothing();

	await tx
		.insert(courses)
		.values({
			id: DEV_COURSE_ID,
			teacherId: DEV_TEACHER_ID,
			title: "Development Course",
			description: "Course created by the development seed",
			coverUrl: "https://example.com/dev-course-cover.png",
			priceYd: "4000000000000000000",
			status: "draft",
		})
		.onConflictDoNothing();
});

console.log("Development seed completed");
