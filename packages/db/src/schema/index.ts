import { pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export * from "./core";
export * from "./learning";

export const systemChecks = pgTable("system_checks", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: varchar("name", { length: 100 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});
