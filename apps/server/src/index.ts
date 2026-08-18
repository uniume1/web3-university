import { trpcServer } from "@hono/trpc-server";
import { createContext } from "@web3-school/api/context";
import { appRouter } from "@web3-school/api/routers/index";
import { env } from "@web3-school/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

const app = new Hono();

const createTrpcMiddleware = (endpoint: string) =>
	trpcServer({
		endpoint,
		router: appRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	});

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

app.use("/trpc/*", createTrpcMiddleware("/trpc"));

// Vercel Services preserves the public request path when routing to a service.
// Keep the unprefixed route above for the standalone local server, and expose
// the same router below /api for the unified Vercel deployment.
app.use("/api/trpc/*", createTrpcMiddleware("/api/trpc"));

app.get("/", (c) => {
	return c.text("OK");
});

app.get("/api", (c) => {
	return c.text("OK");
});

import { serve } from "@hono/node-server";

export default app;

if (!process.env.VERCEL) {
	serve(
		{
			fetch: app.fetch,
			port: 3000,
		},
		(info) => {
			console.log(`Server is running on http://localhost:${info.port}`);
		},
	);
}
