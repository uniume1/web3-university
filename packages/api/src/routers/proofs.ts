import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { addresses, CHAIN_ID } from "@web3-school/contracts";
import { db } from "@web3-school/db";
import { courses, users } from "@web3-school/db/schema/core";
import {
	certificates,
	learningProgress,
	signatureNonces,
} from "@web3-school/db/schema/learning";
import { env } from "@web3-school/env/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getAddress, keccak256, stringToHex, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const usernameTypes = {
	UpdateUsername: [
		{ name: "wallet", type: "address" },
		{ name: "username", type: "string" },
		{ name: "nonce", type: "bytes32" },
		{ name: "deadline", type: "uint256" },
	],
} as const;

const signer = env.COURSE_PROOF_SIGNER_PRIVATE_KEY
	? privateKeyToAccount(env.COURSE_PROOF_SIGNER_PRIVATE_KEY as `0x${string}`)
	: null;

export const proofsRouter = router({
	usernameNonce: protectedProcedure.mutation(async ({ ctx }) => {
		const nonce = `0x${randomBytes(32).toString("hex")}`;
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
		await db.insert(signatureNonces).values({
			walletAddress: ctx.user.walletAddress.toLowerCase(),
			purpose: "update_username",
			nonce,
			expiresAt,
		});
		return { nonce, deadline: Math.floor(expiresAt.getTime() / 1000) };
	}),

	updateUsername: protectedProcedure
		.input(
			z.object({
				username: z.string().trim().min(3).max(20),
				nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
				deadline: z.number().int().positive(),
				signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const now = new Date();
			const [nonceRow] = await db
				.select()
				.from(signatureNonces)
				.where(
					and(
						eq(signatureNonces.nonce, input.nonce),
						eq(
							signatureNonces.walletAddress,
							ctx.user.walletAddress.toLowerCase(),
						),
						eq(signatureNonces.purpose, "update_username"),
						isNull(signatureNonces.usedAt),
						gt(signatureNonces.expiresAt, now),
					),
				)
				.limit(1);
			if (!nonceRow || input.deadline < Math.floor(Date.now() / 1000)) {
				throw new TRPCError({ code: "BAD_REQUEST" });
			}

			const valid = await verifyTypedData({
				address: getAddress(ctx.user.walletAddress),
				domain: {
					name: "Web3 University Profile",
					version: "1",
					chainId: CHAIN_ID,
					verifyingContract: addresses[CHAIN_ID].courseMarket,
				},
				types: usernameTypes,
				primaryType: "UpdateUsername",
				message: {
					wallet: getAddress(ctx.user.walletAddress),
					username: input.username,
					nonce: input.nonce as `0x${string}`,
					deadline: BigInt(input.deadline),
				},
				signature: input.signature as `0x${string}`,
			});
			if (!valid) throw new TRPCError({ code: "UNAUTHORIZED" });

			const usernameNormalized = input.username
				.normalize("NFKC")
				.toLocaleLowerCase("en-US");

			return db.transaction(async (tx) => {
				const consumed = await tx
					.update(signatureNonces)
					.set({ usedAt: now })
					.where(
						and(
							eq(signatureNonces.id, nonceRow.id),
							isNull(signatureNonces.usedAt),
						),
					)
					.returning({ id: signatureNonces.id });
				if (!consumed.length) throw new TRPCError({ code: "CONFLICT" });

				const [user] = await tx
					.update(users)
					.set({ username: input.username, usernameNormalized, updatedAt: now })
					.where(eq(users.id, ctx.user.id))
					.returning();
				return user;
			});
		}),

	certificate: protectedProcedure
		.input(
			z.object({ courseId: z.string().uuid(), tokenUri: z.string().url() }),
		)
		.mutation(async ({ ctx, input }) => {
			const certificateAddress = addresses[CHAIN_ID].certificate;
			if (!signer || !certificateAddress) {
				throw new TRPCError({ code: "PRECONDITION_FAILED" });
			}

			const [progress] = await db
				.select()
				.from(learningProgress)
				.where(
					and(
						eq(learningProgress.userId, ctx.user.id),
						eq(learningProgress.courseId, input.courseId),
						eq(learningProgress.status, "completed"),
					),
				)
				.limit(1);
			if (!progress) throw new TRPCError({ code: "FORBIDDEN" });

			const [existing] = await db
				.select({ id: certificates.id })
				.from(certificates)
				.where(
					and(
						eq(certificates.userId, ctx.user.id),
						eq(certificates.courseId, input.courseId),
					),
				)
				.limit(1);
			if (existing) throw new TRPCError({ code: "CONFLICT" });

			const [course] = await db
				.select({ chainCourseId: courses.chainCourseId })
				.from(courses)
				.where(eq(courses.id, input.courseId))
				.limit(1);
			if (!course?.chainCourseId) throw new TRPCError({ code: "BAD_REQUEST" });

			const nonce = `0x${randomBytes(32).toString("hex")}` as const;
			const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
			const signature = await signer.signTypedData({
				domain: {
					name: "Web3 University Certificate",
					version: "1",
					chainId: CHAIN_ID,
					verifyingContract: certificateAddress,
				},
				types: {
					CourseCompletion: [
						{ name: "student", type: "address" },
						{ name: "courseId", type: "uint256" },
						{ name: "tokenURIHash", type: "bytes32" },
						{ name: "nonce", type: "bytes32" },
						{ name: "deadline", type: "uint256" },
					],
				},
				primaryType: "CourseCompletion",
				message: {
					student: getAddress(ctx.user.walletAddress),
					courseId: BigInt(course.chainCourseId),
					tokenURIHash: keccak256(stringToHex(input.tokenUri)),
					nonce,
					deadline,
				},
			});

			return {
				courseId: course.chainCourseId,
				tokenUri: input.tokenUri,
				nonce,
				deadline: deadline.toString(),
				signature,
			};
		}),
});
