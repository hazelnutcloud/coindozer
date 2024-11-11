import Elysia, { t } from "elysia";
import {
	createSiweMessage,
	generateSiweNonce,
	parseSiweMessage,
	validateSiweMessage,
} from "viem/siwe";
import { CHAIN_ID } from "../utils/constants";
import { getEnv } from "../utils/env";
import type { ServerDB } from "../server";
import type { PublicClient } from "viem";
import { usersTable } from "../db/server/schema";
import { eq } from "drizzle-orm";
import { createSession, generateSessionToken } from "../auth/tokens";

export const auth = (params: { db: ServerDB; publicClient: PublicClient }) =>
	new Elysia({ name: "auth" })
		.decorate("db", params.db)
		.decorate("originUrl", new URL(getEnv("FRONTEND_URL")))
		.decorate("publicClient", params.publicClient)
		.get(
			"/auth/login/wallet",
			({ query: { address }, originUrl }) =>
				createSiweMessage({
					address,
					chainId: CHAIN_ID,
					domain: originUrl.origin,
					nonce: generateSiweNonce(),
					uri: originUrl.href,
					version: "1",
					expirationTime: new Date(Date.now() + 1000 * 60 * 10),
				}),
			{
				query: t.Object({
					address: t.TemplateLiteral("0x${string}"),
				}),
			},
		)
		.post(
			"/auth/login/wallet",
			async ({
				db,
				publicClient,
				body: { message, signature },
				cookie: { session },
				originUrl,
			}) => {
				const parsedMessage = parseSiweMessage(message);
				if (!parsedMessage.address) {
					return new Response("Invalid message", { status: 400 });
				}

				const validated = validateSiweMessage({
					message: parsedMessage,
					domain: originUrl.origin,
				});
				if (!validated) {
					return new Response("Invalid message", { status: 400 });
				}

				const verified = await publicClient.verifySiweMessage({
					message,
					signature,
				});

				if (!verified) {
					return new Response("Invalid signature", { status: 400 });
				}

				const user =
					db
						.select()
						.from(usersTable)
						.where(eq(usersTable.address, parsedMessage.address))
						.get() ??
					db
						.insert(usersTable)
						.values({ address: parsedMessage.address })
						.returning()
						.get();

				const sessionToken = generateSessionToken();
				const newSession = createSession({
					db,
					token: sessionToken,
					userId: user.id,
				});
				session.value = sessionToken;
				session.httpOnly = true;
				session.sameSite = "lax";
				session.expires = newSession.expiresAt;
				session.path = "/";
				session.secure = process.env.NODE_ENV === "production";

				return "OK";
			},
			{
				body: t.Object({
					message: t.String(),
					signature: t.TemplateLiteral("0x${string}"),
				}),
			},
		);
