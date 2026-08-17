import { initTRPC, TRPCError } from "@trpc/server";

import type { AppRole, Context } from "./context";

export const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;

const requireAuth = t.middleware(({ ctx, next }) => {
	if (!ctx.auth) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({ ctx: { ...ctx, auth: ctx.auth } });
});

const requireUser = t.middleware(({ ctx, next }) => {
	if (!ctx.auth || !ctx.user) {
		throw new TRPCError({ code: "UNAUTHORIZED" });
	}
	return next({
		ctx: {
			...ctx,
			auth: ctx.auth,
			user: ctx.user,
		},
	});
});

export const authenticatedProcedure = t.procedure.use(requireAuth);
export const protectedProcedure = t.procedure.use(requireUser);

export const roleProcedure = (roles: readonly AppRole[]) =>
	protectedProcedure.use(({ ctx, next }) => {
		if (!roles.includes(ctx.user.role)) {
			throw new TRPCError({ code: "FORBIDDEN" });
		}
		return next({ ctx });
	});
