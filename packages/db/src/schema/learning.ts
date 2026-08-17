import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { courses, users } from "./core"

export const progressStatus = pgEnum("progress_status", [
  "not_started",
  "learning",
  "completed",
])

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    chainId: integer("chain_id").notNull(),
    contractAddress: varchar("contract_address", { length: 42 }).notNull(),
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    logIndex: integer("log_index").notNull(),
    blockNumber: varchar("block_number", { length: 78 }).notNull(),
    buyerAddress: varchar("buyer_address", { length: 42 }).notNull(),
    amount: varchar("amount", { length: 78 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("purchase_log_uq").on(t.chainId, t.txHash, t.logIndex),
    uniqueIndex("purchase_user_course_uq").on(t.userId, t.courseId),
  ],
)

export const learningProgress = pgTable(
  "learning_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    progressPercent: integer("progress_percent").notNull().default(0),
    quizScore: integer("quiz_score"),
    status: progressStatus("status").notNull().default("not_started"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("progress_user_course_uq").on(t.userId, t.courseId)],
)

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    content: varchar("content", { length: 1000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("comments_course_created_idx").on(t.courseId, t.createdAt)],
)

export const signatureNonces = pgTable(
  "signature_nonces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    nonce: varchar("nonce", { length: 66 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("signature_nonce_uq").on(t.nonce)],
)

export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    tokenId: varchar("token_id", { length: 78 }).notNull(),
    contractAddress: varchar("contract_address", { length: 42 }).notNull(),
    txHash: varchar("tx_hash", { length: 66 }).notNull(),
    metadataUri: text("metadata_uri").notNull(),
    mintedAt: timestamp("minted_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("certificate_user_course_uq").on(t.userId, t.courseId)],
)
