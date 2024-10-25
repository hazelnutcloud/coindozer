import { sqliteTable, int, blob } from "drizzle-orm/sqlite-core";

export const worldSnapshotsTable = sqliteTable("world_snapshots", {
	id: int().primaryKey(),
	snapshotData: blob({ mode: "buffer" }).notNull(),
});
