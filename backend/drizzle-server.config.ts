import { defineConfig } from "drizzle-kit";
import { getEnv } from "./src/utils/env";

export default defineConfig({
	dialect: "sqlite",
	dbCredentials: {
		url: getEnv("DB_FILE_NAME"),
	},
	schema: "./src/db/server/schema.ts",
	out: "./migrations/server",
});
