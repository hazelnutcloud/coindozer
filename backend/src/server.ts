import { connect } from "@nats-io/transport-node";
import {
	NEW_COIN_SUBJECT,
	NEW_COINS_TOPIC,
	WORLD_HASH_TOPIC,
	WORLD_SNAPSHOT_SUBJECT,
	type NewCoinPacket,
	type ServerPacket,
	type WorldSnapshotPacket,
	SYNC_CHECK_FRAMES,
} from "common";
import { getEnv } from "./utils/env";
import Elysia from "elysia";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./db/server/schema";
import { auth } from "./server/auth";
import { createPublicClient, http } from "viem";
import { berachainTestnetbArtio } from "viem/chains";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { sql } from "drizzle-orm";

const natsHostport = getEnv("NATS_HOSTPORT");

const nats = await connect({ servers: natsHostport });

const db = drizzle(getEnv("DB_FILE_NAME"), { schema });
db.run(sql`PRAGMA journal_mode = WAL`);
db.run(sql`PRAGMA synchronous = 1`);
migrate(db, { migrationsFolder: "migrations/server" });

export type ServerDB = typeof db;

type Snapshot = {
	base64Data: string | undefined;
	frame: number;
};

const activeSnapshot: Snapshot = {
	base64Data: undefined,
	frame: 0,
};
const stagingSnapshot: Snapshot = {
	base64Data: undefined,
	frame: 0,
};

const subscribeToWorldSnapshot = async () => {
	if (!app.server) return;
	const sub = nats.subscribe(WORLD_SNAPSHOT_SUBJECT);

	for await (const msg of sub) {
		const packet = msg.json<WorldSnapshotPacket>();

		if (packet.frame <= stagingSnapshot.frame) {
			console.warn(
				"received old snapshot packet, frame number",
				packet.frame,
				". discarding...",
			);
			continue;
		}

		activeSnapshot.base64Data = stagingSnapshot.base64Data;
		activeSnapshot.frame = stagingSnapshot.frame;

		stagingSnapshot.base64Data = packet.base64Snapshot;
		stagingSnapshot.frame = packet.frame;

		if (packet.frame % SYNC_CHECK_FRAMES !== 0) {
			continue;
		}

		const sendPacket: ServerPacket = {
			kind: "world-hash",
			frame: packet.frame,
		};

		app.server.publish(WORLD_HASH_TOPIC, JSON.stringify(sendPacket));
	}
};

const subscribeToNewCoins = async () => {
	if (!app.server) return;
	const sub = nats.subscribe(NEW_COIN_SUBJECT);

	for await (const msg of sub) {
		const packet = msg.json<NewCoinPacket>();

		const sendPacket: ServerPacket = {
			kind: "new-coin",
			frame: packet.frame,
		};
		app.server.publish(NEW_COINS_TOPIC, JSON.stringify(sendPacket));
	}
};

const app = new Elysia()
	.ws("/world", {
		open(ws) {
			if (!activeSnapshot.base64Data) {
				const packet: ServerPacket = {
					kind: "error",
					message: "Game world not ready",
				};
				ws.send(JSON.stringify(packet));
				ws.close();
				return;
			}

			const packet: ServerPacket = {
				kind: "init",
				base64Data: activeSnapshot.base64Data,
				frame: activeSnapshot.frame,
			};
			ws.subscribe(NEW_COINS_TOPIC);
			ws.subscribe(WORLD_HASH_TOPIC);
			ws.send(JSON.stringify(packet));
		},
	})
	.use(
		auth({
			db,
			publicClient: createPublicClient({
				transport: http(),
				chain: berachainTestnetbArtio,
			}),
		}),
	)
	.compile()
	.listen(3000);

subscribeToWorldSnapshot();
subscribeToNewCoins();

export type App = typeof app;
