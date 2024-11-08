import { defineConfig } from "drizzle-kit";
import { getEnv } from "./src/env";

export default defineConfig({
	dialect: "sqlite",
	dbCredentials: {
		url: getEnv("DB_FILE_NAME"),
	},
	schema: "./src/db/world/schema.ts",
	out: "./migrations/world",
});
