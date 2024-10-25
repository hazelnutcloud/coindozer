import { connect } from "@nats-io/transport-node";
import {
	ADD_COIN_SUBJECT,
	base64ToUint8Array,
	NEW_COIN_SUBJECT,
	NEW_COINS_TOPIC,
	WORLD_HASH_TOPIC,
	WORLD_SNAPSHOT_SUBJECT,
	type AddCoinPacket,
	type ClientPacket,
	type NewCoinPacket,
	type ServerPacket,
	type WorldSnapshotPacket,
} from "common";
import { SYNC_CHECK_FRAMES } from "./config";
import { hashData } from "common";

if (!process.env.NATS_HOSTPORT) throw new Error("NATS_HOSTPORT not set");

const nats = await connect({ servers: process.env.NATS_HOSTPORT });

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
	const sub = nats.subscribe(WORLD_SNAPSHOT_SUBJECT);

	for await (const msg of sub) {
		const packet = msg.json<WorldSnapshotPacket>();
		console.log("Server: world snapshot", packet.frame);

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

		const hash = await hashData(packet.base64Snapshot);
		const sendPacket: ServerPacket = {
			kind: "world-hash",
			frame: packet.frame,
			hash,
		};

		server.publish(WORLD_HASH_TOPIC, JSON.stringify(sendPacket));
	}
};

const subscribeToNewCoins = async () => {
	const sub = nats.subscribe(NEW_COIN_SUBJECT);

	for await (const msg of sub) {
		const packet = msg.json<NewCoinPacket>();
		console.log("Server: new coin", packet);

		const sendPacket: ServerPacket = {
			kind: "new-coin",
			frame: packet.frame,
		};
		server.publish(NEW_COINS_TOPIC, JSON.stringify(sendPacket));
	}
};

subscribeToWorldSnapshot();
subscribeToNewCoins();

type WsData = { user?: { address: string } };

const server = Bun.serve<WsData>({
	fetch(request, server) {
		const url = new URL(request.url);

		if (url.pathname === "/world") {
			// TODO: implement user sessions and auth
			const success = server.upgrade<WsData>(request, {
				data: { user: { address: "0xdeadbeef" } },
			});
			if (success) return;
			return new Response("Websocket upgrade failed", { status: 500 });
		}

		return new Response("Not Found", { status: 404 });
	},
	websocket: {
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
			ws.send(JSON.stringify(packet), true);
		},
		message(ws, message) {
			if (!ws.data.user) {
				const packet: ServerPacket = {
					kind: "error",
					message: "Unauthenticated",
				};
				ws.send(JSON.stringify(packet));
				return;
			}

			if (message instanceof Buffer) {
				const packet: ServerPacket = {
					kind: "error",
					message: "Invalid packet",
				};
				ws.send(JSON.stringify(packet));
				return;
			}

			const packet: ClientPacket = JSON.parse(message);

			if (packet.kind === "add-coin") {
				const packet: AddCoinPacket = {
					sender: ws.data.user.address,
				};
				nats.publish(ADD_COIN_SUBJECT, JSON.stringify(packet));
			}
		},
		close(ws) {
			ws.unsubscribe(NEW_COINS_TOPIC);
			ws.unsubscribe(WORLD_HASH_TOPIC);
		},
		perMessageDeflate: true,
	},
});

console.log("Server listening on", `${server.hostname}:${server.port}`);
