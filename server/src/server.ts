import { CoinDozerWorld, defaultWorldConfig } from "world";
import { drizzle } from "drizzle-orm/connect";
import { worldSnapshotsTable } from "./db/schema";
import { FRAME_DELAY } from "./config";
import {
	NEW_COINS_TOPIC,
	type ClientPacket,
	type ServerPacket,
} from "./protocol";
const rapier = await import("@dimforge/rapier3d");

if (!process.env.DB_FILE_NAME) throw new Error("DB_FILE_NAME not set");
const db = await drizzle("bun:sqlite", process.env.DB_FILE_NAME);

const latestWorldSnapshotRow = (
	await db.select().from(worldSnapshotsTable).limit(1)
)[0];

type Snapshot = {
	data: Uint8Array | undefined;
	frame: number;
};

const activeSnapshot: Snapshot = {
	data: undefined,
	frame: 0,
};
const stagingSnapshot: Snapshot = {
	data: undefined,
	frame: 0,
};

const world = new CoinDozerWorld(rapier, {
	...defaultWorldConfig,
	snapshot: latestWorldSnapshotRow?.snapshotData,
});

world.subscribeToSnapshots((frame) => {
	if (frame % FRAME_DELAY !== 0) return;

	return (snapshot) => {
		activeSnapshot.data = stagingSnapshot.data;
		activeSnapshot.frame = stagingSnapshot.frame;
		stagingSnapshot.data = snapshot;
		stagingSnapshot.frame = frame;

		const snapshotData = Buffer.from(snapshot);
		db.insert(worldSnapshotsTable)
			.values([{ id: 0, snapshotData }])
			.onConflictDoUpdate({
				set: { snapshotData },
				target: worldSnapshotsTable.id,
			})
			.run();
	};
});

world.start();

const server = Bun.serve({
	fetch(request, server) {
		const url = new URL(request.url);

		if (url.pathname === "/world") {
			const success = server.upgrade(request);
			if (success) return;
			return new Response("Websocket upgrade failed", { status: 500 });
		}

		return new Response("Not Found", { status: 404 });
	},
	websocket: {
		message(ws, message) {
			if (message instanceof Buffer) {
				const packet = {
					kind: "error",
					message: "Invalid packet",
				};
				ws.send(JSON.stringify(packet));
				return;
			}

			const packet: ClientPacket = JSON.parse(message);

			if (packet.kind === "add-coin") {
				const frame = world.addCoin();

				const packet: ServerPacket = {
					kind: "new-coin",
					frame,
				};
				const encodedPacket = JSON.stringify(packet);

				server.publish(NEW_COINS_TOPIC, encodedPacket);
			}
		},
		open(ws) {
			if (!activeSnapshot.data) {
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
				data: Buffer.from(activeSnapshot.data).toString("base64"),
				frame: activeSnapshot.frame,
			};
			ws.subscribe(NEW_COINS_TOPIC);
			ws.send(JSON.stringify(packet), true);
		},
		close(ws) {
			ws.unsubscribe(NEW_COINS_TOPIC);
		},
		perMessageDeflate: true,
	},
});
