import type { CoinDozerWorldConfig } from ".";

export const defaultWorldConfig: CoinDozerWorldConfig = {
	fps: 30,
	containerCuboids: [
		{
			size: { width: 1, height: 0.1, depth: 1 },
			position: { x: 0, y: 0, z: 0 },
		},
	],
	coinSize: {
		halfHeight: 0.01,
		radius: 0.04,
	},
	gravity: {
		x: 0,
		y: -9.81,
		z: 0,
	},
	coinDropY: 0.5,
};

export const SYNC_CHECK_FRAMES = 60;
