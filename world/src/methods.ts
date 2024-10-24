import type { World } from "@dimforge/rapier3d-compat";
import type { WorldConfig } from "./config";

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
