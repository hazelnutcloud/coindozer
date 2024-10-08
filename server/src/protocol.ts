export type ServerPacket =
	| {
			kind: "error";
			message: string;
	  }
	| {
			kind: "init";
			data: string;
			frame: number;
	  }
	| {
			kind: "new-coin";
			frame: number;
	  };

export type ClientPacket = { kind: "add-coin" };

export const NEW_COINS_TOPIC = "new-coins" as const;

export type SubscriptionTopic = typeof NEW_COINS_TOPIC;
