import { index, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable(
	"users",
	{
		id: int().primaryKey({ autoIncrement: true }),
		address: text(),
	},
	(table) => ({
		addressIndex: index("address_index").on(table.address),
	}),
);

export const sessionsTable = sqliteTable("sessions", {
	id: text().primaryKey(),
	userId: int("user_id")
		.notNull()
		.references(() => usersTable.id),
	expiresAt: int("expires_at", {
		mode: "timestamp",
	}).notNull(),
});

export const userScoresTable = sqliteTable(
	"user_scores",
	{
		id: int().primaryKey({ autoIncrement: true }),
		userId: int("user_id")
			.references(() => usersTable.id)
			.notNull(),
		score: int().notNull().default(0),
	},
	(table) => ({
		uniqueUserId: unique().on(table.userId),
		userIdIndex: index("user_id_index").on(table.userId),
	}),
);
