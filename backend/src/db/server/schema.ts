import { index, int, sqliteTable, unique } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
	id: int().primaryKey({ autoIncrement: true }),
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
    userIdIndex: index("user_id_index").on(table.userId)
	}),
);
