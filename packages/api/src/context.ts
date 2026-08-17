import { PrivyClient } from "@privy-io/node"
import { db } from "@web3-school/db"
import { users } from "@web3-school/db/schema/core"
import { env } from "@web3-school/env/server"
import { eq } from "drizzle-orm"
import type { Context as HonoContext } from "hono"

export type AppRole = "student" | "teacher" | "operator" | "admin"

export type AppUser = {
  id: string
  walletAddress: string
  role: AppRole
}

export type CreateContextOptions = {
  context: HonoContext
}

const privy =
  env.PRIVY_APP_ID && env.PRIVY_APP_SECRET
    ? new PrivyClient({
        appId: env.PRIVY_APP_ID,
        appSecret: env.PRIVY_APP_SECRET,
      })
    : null

export async function createContext(options: CreateContextOptions) {
  const authorization = options.context.req.header("authorization")

  if (!privy || !authorization?.startsWith("Bearer ")) {
    return {
      hono: options.context,
      auth: null as { privyUserId: string } | null,
      user: null as AppUser | null,
    }
  }

  try {
    const claims = await privy
      .utils()
      .auth()
      .verifyAccessToken(authorization.slice(7))
    const [record] = await db
      .select({
        id: users.id,
        walletAddress: users.walletAddress,
        role: users.role,
      })
      .from(users)
      .where(eq(users.privyUserId, claims.user_id))
      .limit(1)

    return {
      hono: options.context,
      auth: { privyUserId: claims.user_id },
      user: record ?? null,
    }
  } catch {
    return {
      hono: options.context,
      auth: null,
      user: null,
    }
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
