// browser <-> server websocket protocol

export type ServerPacket =
	| {
			kind: "error";
			message: string;
	  }
	| {
			kind: "init";
			base64Data: string;
			frame: number;
	  }
	| {
			kind: "new-coin";
			frame: number;
	  }
	| {
			kind: "world-hash";
			frame: number;
			hash: string;
	  };

export type ClientPacket = { kind: "add-coin" };

export const NEW_COINS_TOPIC = "new-coins";
export const WORLD_HASH_TOPIC = "world-hash";

// nats subjects

export const ADD_COIN_SUBJECT = "addcoin";
export type AddCoinPacket = {
	sender: string;
};

export const WORLD_SNAPSHOT_SUBJECT = "worldsnapshot";
export type WorldSnapshotPacket = {
	base64Snapshot: string; // base64 encoded snapshot
	frame: number;
};

export const NEW_COIN_SUBJECT = "newcoin";
export type NewCoinPacket = {
	frame: number;
	sender: string;
};
