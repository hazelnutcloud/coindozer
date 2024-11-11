import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import type { ServerDB } from "../server";
import { sessionsTable, usersTable } from "../db/server/schema";
import { eq } from "drizzle-orm";

export function generateSessionToken() {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	const token = encodeBase32LowerCaseNoPadding(bytes);
	return token;
}

export function createSession(params: {
	db: ServerDB;
	token: string;
	userId: number;
}) {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(params.token);
	const sessionId = hasher.digest("hex");

	const session = {
		id: sessionId,
		userId: params.userId,
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
	};

	params.db.insert(sessionsTable).values(session).run();

	return session;
}

export function validateSessionToken(params: {
	db: ServerDB;
	token: string;
}) {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(params.token);
	const sessionId = hasher.digest("hex");

	const result = params.db
		.select()
		.from(sessionsTable)
		.innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
		.where(eq(sessionsTable.id, sessionId))
		.get();

	if (!result) return null;

	const { sessions, users } = result;

	if (Date.now() > sessions.expiresAt.getTime()) {
		params.db
			.delete(sessionsTable)
			.where(eq(sessionsTable.id, sessionId))
			.run();
		return null;
	}

	if (Date.now() >= sessions.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
		sessions.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
		params.db
			.update(sessionsTable)
			.set({
				expiresAt: sessions.expiresAt,
			})
			.where(eq(sessionsTable.id, sessions.id))
			.run();
	}

	return { session: sessions, user: users };
}

export function invalidateSession(params: {
	db: ServerDB;
	sessionId: string;
}) {
	params.db
		.delete(sessionsTable)
		.where(eq(sessionsTable.id, params.sessionId))
		.run();
}
