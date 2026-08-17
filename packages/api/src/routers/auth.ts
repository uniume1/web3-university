import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { db } from "@web3-school/db";
import { users } from "@web3-school/db/schema/core";
import { signatureNonces } from "@web3-school/db/schema/learning";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getAddress, verifyMessage } from "viem";
import { z } from "zod";

import { authenticatedProcedure, protectedProcedure, router } from "../index";

function bindingMessage(input: {
	privyUserId: string;
	walletAddress: string;
	nonce: string;
	deadline: number;
}) {
	return [
		"Web3 University wallet binding",
		`Privy User: ${input.privyUserId}`,
		`Wallet: ${input.walletAddress}`,
		`Nonce: ${input.nonce}`,
		`Deadline: ${input.deadline}`,
	].join("\n");
}

export const authRouter = router({
	bindingNonce: authenticatedProcedure
		.input(z.object({ walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }))
		.mutation(async ({ ctx, input }) => {
			const walletAddress = getAddress(input.walletAddress).toLowerCase();
			const nonce = `0x${randomBytes(32).toString("hex")}`;
			const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
			const deadline = Math.floor(expiresAt.getTime() / 1000);

			await db.insert(signatureNonces).values({
				walletAddress,
				purpose: `bind_wallet:${ctx.auth.privyUserId}`,
				nonce,
				expiresAt,
			});

			return {
				nonce,
				deadline,
				message: bindingMessage({
					privyUserId: ctx.auth.privyUserId,
					walletAddress,
					nonce,
					deadline,
				}),
			};
		}),

	bindWallet: authenticatedProcedure
		.input(
			z.object({
				walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
				nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
				deadline: z.number().int().positive(),
				signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const walletAddress = getAddress(input.walletAddress).toLowerCase();
			const now = new Date();
			const [nonceRow] = await db
				.select()
				.from(signatureNonces)
				.where(
					and(
						eq(signatureNonces.nonce, input.nonce),
						eq(signatureNonces.walletAddress, walletAddress),
						eq(signatureNonces.purpose, `bind_wallet:${ctx.auth.privyUserId}`),
						isNull(signatureNonces.usedAt),
						gt(signatureNonces.expiresAt, now),
					),
				)
				.limit(1);

			if (!nonceRow || input.deadline < Math.floor(Date.now() / 1000)) {
				throw new TRPCError({ code: "BAD_REQUEST" });
			}

			const valid = await verifyMessage({
				address: getAddress(walletAddress),
				message: bindingMessage({
					privyUserId: ctx.auth.privyUserId,
					walletAddress,
					nonce: input.nonce,
					deadline: input.deadline,
				}),
				signature: input.signature as `0x${string}`,
			});
			if (!valid) throw new TRPCError({ code: "UNAUTHORIZED" });

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
					.insert(users)
					.values({
						privyUserId: ctx.auth.privyUserId,
						walletAddress,
						role: "student",
					})
					.onConflictDoNothing()
					.returning();

				if (user) return user;

				const [existing] = await tx
					.select()
					.from(users)
					.where(eq(users.privyUserId, ctx.auth.privyUserId))
					.limit(1);
				if (!existing || existing.walletAddress !== walletAddress) {
					throw new TRPCError({ code: "CONFLICT" });
				}
				return existing;
			});
		}),

	me: protectedProcedure.query(({ ctx }) => ctx.user),
});
