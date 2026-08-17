import { publicProcedure, router } from "../index";
import { authRouter } from "./auth";
import { commentsRouter } from "./comments";
import { coursesRouter } from "./courses";
import { learningRouter } from "./learning";
import { managementRouter } from "./management";
import { proofsRouter } from "./proofs";
import { purchasesRouter } from "./purchases";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => "OK"),
	auth: authRouter,
	comments: commentsRouter,
	courses: coursesRouter,
	learning: learningRouter,
	management: managementRouter,
	proofs: proofsRouter,
	purchases: purchasesRouter,
});

export type AppRouter = typeof appRouter;
