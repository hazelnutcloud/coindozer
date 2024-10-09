import { CoinDozerWorld, defaultWorldConfig, SYNC_CHECK_FRAMES } from "world";
import { drizzle, migrate } from "drizzle-orm/connect";
import { worldSnapshotsTable } from "./db/schema";
import { LOCKSTEP_DELAY } from "./config";
import {
	NEW_COINS_TOPIC,
	WORLD_HASH_TOPIC,
	type ClientPacket,
	type ServerPacket,
} from "./protocol";
import rapier from "@dimforge/rapier3d-compat";

await rapier.init();

if (!process.env.DB_FILE_NAME) throw new Error("DB_FILE_NAME not set");
const db = await drizzle("bun:sqlite", process.env.DB_FILE_NAME);
await migrate(db, { migrationsFolder: "drizzle" });

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

world.subscribeToUpdates((frame) => {
	if (frame % LOCKSTEP_DELAY !== 0) return;

	const snapshot = world.takeSnapshot();

	if (frame % SYNC_CHECK_FRAMES === 0) {
		crypto.subtle.digest("SHA-256", snapshot).then((hash) => {
			const hashArray = Array.from(new Uint8Array(hash));
			const hashHex = hashArray
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			const packet: ServerPacket = {
				kind: "world-hash",
				hash: hashHex,
				frame,
			};
			server.publish(WORLD_HASH_TOPIC, JSON.stringify(packet));
		});
	}

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
});

setInterval(() => {
	console.time("world update");
	world.update();
	console.timeEnd("world update");
}, 1000 / world.config.fps);

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
			ws.subscribe(WORLD_HASH_TOPIC);
			ws.send(JSON.stringify(packet), true);
		},
		close(ws) {
			ws.unsubscribe(NEW_COINS_TOPIC);
			ws.unsubscribe(WORLD_HASH_TOPIC);
		},
		perMessageDeflate: true,
	},
});

console.log("Server listening on", `${server.hostname}:${server.port}`);
