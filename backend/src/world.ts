import { drizzle } from "drizzle-orm/bun-sqlite";
import { worldSnapshotsTable } from "./db/schema";
import rapier from "@dimforge/rapier3d-compat";
import { connect } from "@nats-io/transport-node";
import { defaultWorldConfig } from "./config";
import { addCoin, initWorld } from "./methods";
import {
	ADD_COIN_SUBJECT,
	NEW_COIN_SUBJECT,
	WORLD_SNAPSHOT_SUBJECT,
	type AddCoinPacket,
	type NewCoinPacket,
	type WorldSnapshotPacket,
} from "common";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

await rapier.init();

if (!process.env.DB_FILE_NAME) throw new Error("DB_FILE_NAME not set");
if (!process.env.NATS_HOSTPORT) throw new Error("NATS_HOSTPORT not set");

const db = drizzle(process.env.DB_FILE_NAME);
migrate(db, { migrationsFolder: "drizzle" });

const nats = await connect({ servers: process.env.NATS_HOSTPORT });

const latestWorldSnapshotRow = (
	await db.select().from(worldSnapshotsTable).limit(1)
)[0];

type Snapshot = {
	data: Uint8Array | undefined;
	frame: number;
};

const worldConfig = {
	...defaultWorldConfig,
	snapshot: latestWorldSnapshotRow?.snapshotData,
};

const world = initWorld({
	config: worldConfig,
	rapier,
});

const subscribeToAddCoins = async () => {
	const addCoinSub = nats.subscribe(ADD_COIN_SUBJECT);
	for await (const msg of addCoinSub) {
		const packet = msg.json<AddCoinPacket>();

		const frameSnapshot = frame;
		addCoin({ config: worldConfig, rapier, world });

		const sendPacket: NewCoinPacket = {
			frame: frameSnapshot,
			sender: packet.sender,
		};
		nats.publish(NEW_COIN_SUBJECT, JSON.stringify(sendPacket));
	}
};
subscribeToAddCoins();

let lastTime = performance.now();
let accumulator = 0;
let frame = 0;
const worldStepTime = 1000 / worldConfig.fps;

setInterval(() => {
	const currTime = performance.now();
	const deltaTime = currTime - lastTime;
	lastTime = currTime;
	accumulator += deltaTime > 250 ? 250 : deltaTime;

	while (accumulator >= worldStepTime) {
		accumulator -= worldStepTime;

		const frameSnapshot = frame;
		if (frameSnapshot % worldConfig.lockstepFrameDelay === 0) {
			const snapshot = world.takeSnapshot();

			const snapshotData = Buffer.from(snapshot);

			db.insert(worldSnapshotsTable)
				.values([{ id: 0, snapshotData }])
				.onConflictDoUpdate({
					set: { snapshotData },
					target: worldSnapshotsTable.id,
				})
				.run();

			const packet: WorldSnapshotPacket = {
				frame: frameSnapshot,
				base64Snapshot: snapshotData.toString("base64"),
			};

			nats.publish(WORLD_SNAPSHOT_SUBJECT, JSON.stringify(packet));
		}

		world.step();
		frame++;
	}
});
