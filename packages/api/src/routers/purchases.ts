import { TRPCError } from "@trpc/server";
import { addresses, CHAIN_ID } from "@web3-school/contracts";
import { db } from "@web3-school/db";
import { courses } from "@web3-school/db/schema/core";
import { learningProgress, purchases } from "@web3-school/db/schema/learning";
import { env } from "@web3-school/env/server";
import { and, eq } from "drizzle-orm";
import { createPublicClient, http, parseAbi, parseEventLogs } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";

import { protectedProcedure, router } from "../index";

const publicClient = createPublicClient({
	chain: sepolia,
	transport: http(env.SEPOLIA_RPC_URL),
});

const coursePurchasedEventAbi = parseAbi([
	"event CoursePurchased(address indexed buyer, uint256 indexed courseId, uint256 price)",
]);

export const purchasesRouter = router({
	verify: protectedProcedure
		.input(
			z.object({
				courseId: z.string().uuid(),
				txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [course] = await db
				.select()
				.from(courses)
				.where(eq(courses.id, input.courseId))
				.limit(1);

			if (!course?.chainCourseId || course.status !== "active") {
				throw new TRPCError({ code: "BAD_REQUEST" });
			}

			const receipt = await publicClient.waitForTransactionReceipt({
				hash: input.txHash as `0x${string}`,
				confirmations: 2,
			});
			if (receipt.status !== "success") {
				throw new TRPCError({ code: "BAD_REQUEST" });
			}

			const events = parseEventLogs({
				abi: coursePurchasedEventAbi,
				eventName: "CoursePurchased",
				logs: receipt.logs,
				strict: true,
			});
			const event = events.find(
				(item) =>
					item.address.toLowerCase() ===
					addresses[CHAIN_ID].courseMarket.toLowerCase(),
			);

			if (!event) throw new TRPCError({ code: "BAD_REQUEST" });
			if (
				event.args.buyer.toLowerCase() !== ctx.user.walletAddress.toLowerCase()
			) {
				throw new TRPCError({ code: "FORBIDDEN" });
			}
			if (event.args.courseId !== BigInt(course.chainCourseId)) {
				throw new TRPCError({ code: "BAD_REQUEST" });
			}

			return db.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(purchases)
					.where(
						and(
							eq(purchases.userId, ctx.user.id),
							eq(purchases.courseId, course.id),
						),
					)
					.limit(1);
				if (existing) return existing;

				const [purchase] = await tx
					.insert(purchases)
					.values({
						userId: ctx.user.id,
						courseId: course.id,
						chainId: CHAIN_ID,
						contractAddress: addresses[CHAIN_ID].courseMarket.toLowerCase(),
						txHash: receipt.transactionHash,
						logIndex: event.logIndex,
						blockNumber: receipt.blockNumber.toString(),
						buyerAddress: event.args.buyer.toLowerCase(),
						amount: event.args.price.toString(),
					})
					.returning();

				await tx
					.insert(learningProgress)
					.values({ userId: ctx.user.id, courseId: course.id })
					.onConflictDoNothing();

				return purchase;
			});
		}),
});
