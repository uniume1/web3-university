import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
	"student",
	"teacher",
	"operator",
	"admin",
]);
export const courseStatus = pgEnum("course_status", [
	"draft",
	"pending_review",
	"rejected",
	"pending_chain",
	"active",
	"paused",
	"archived",
]);

export const users = pgTable(
	"users",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		privyUserId: varchar("privy_user_id", { length: 128 }).notNull(),
		walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
		username: varchar("username", { length: 20 }),
		usernameNormalized: varchar("username_normalized", { length: 20 }),
		role: userRole("role").notNull().default("student"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("users_privy_id_uq").on(t.privyUserId),
		uniqueIndex("users_wallet_uq").on(t.walletAddress),
		uniqueIndex("users_username_normalized_uq").on(t.usernameNormalized),
	],
);

export const teachers = pgTable("teachers", {
	id: uuid("id").defaultRandom().primaryKey(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id),
	displayName: varchar("display_name", { length: 80 }).notNull(),
	bio: text("bio").notNull().default(""),
	approved: boolean("approved").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const courses = pgTable(
	"courses",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		chainCourseId: varchar("chain_course_id", { length: 78 }),
		teacherId: uuid("teacher_id")
			.notNull()
			.references(() => teachers.id),
		title: varchar("title", { length: 120 }).notNull(),
		description: text("description").notNull(),
		coverUrl: text("cover_url").notNull(),
		priceYd: varchar("price_yd", { length: 78 }).notNull(),
		metadataUri: text("metadata_uri"),
		metadataHash: varchar("metadata_hash", { length: 66 }),
		chainTxHash: varchar("chain_tx_hash", { length: 66 }),
		status: courseStatus("status").notNull().default("draft"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [
		uniqueIndex("courses_chain_id_uq").on(t.chainCourseId),
		index("courses_status_idx").on(t.status),
		index("courses_teacher_idx").on(t.teacherId),
	],
);

export const courseSections = pgTable(
	"course_sections",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		courseId: uuid("course_id")
			.notNull()
			.references(() => courses.id),
		title: varchar("title", { length: 120 }).notNull(),
		sortOrder: integer("sort_order").notNull(),
		videoAssetId: text("video_asset_id").notNull(),
		durationSeconds: integer("duration_seconds").notNull(),
		required: boolean("required").notNull().default(true),
	},
	(t) => [index("sections_course_order_idx").on(t.courseId, t.sortOrder)],
);
