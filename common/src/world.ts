import type { Vector3, World } from "@dimforge/rapier3d-compat";

export interface WorldConfig {
	fps: number;
	containerCuboids: {
		size: { width: number; height: number; depth: number };
		position: Vector3;
	}[];
	coinSize: { halfHeight: number; radius: number };
	gravity: Vector3;
	coinDropY: number;
	lockstepFrameDelay: number;
	snapshot?: Uint8Array;
	frame?: number;
}

export const defaultWorldConfig: WorldConfig = {
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
	lockstepFrameDelay: 15,
};

export const SYNC_CHECK_FRAMES = 60;

type Rapier = typeof import("@dimforge/rapier3d-compat")["default"];

export interface WorldMethodParams {
	rapier: Rapier;
	world: World;
	config: WorldConfig;
}

export function addCoin(params: WorldMethodParams) {
	const { config, rapier, world } = params;

	const bodyDesc = rapier.RigidBodyDesc.dynamic()
		.setTranslation(0, config.coinDropY, 0)
		.setCanSleep(true);
	const body = world.createRigidBody(bodyDesc);

	const collider = rapier.ColliderDesc.cylinder(
		config.coinSize.halfHeight,
		config.coinSize.radius,
	);
	world.createCollider(collider, body);

	return body;
}

export function initWorld(params: Omit<WorldMethodParams, "world">) {
	const { config, rapier } = params;
	if (config.snapshot !== undefined) {
		return rapier.World.restoreSnapshot(config.snapshot);
	}

	const world = new rapier.World(config.gravity);

	for (const cuboid of config.containerCuboids) {
		const { position, size } = cuboid;
		const colliderDesc = rapier.ColliderDesc.cuboid(
			size.width / 2,
			size.height / 2,
			size.depth / 2,
		).setTranslation(position.x, position.y, position.z);
		world.createCollider(colliderDesc);
	}

	return world;
}
