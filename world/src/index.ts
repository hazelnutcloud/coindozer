import type { Quaternion, Vector3 } from "@dimforge/rapier3d";

type Rapier = Awaited<typeof import("@dimforge/rapier3d")>;

export { defaultWorldConfig } from "./config";

export interface CoinDozerWorldConfig {
	fps: number;
	containerCuboids: {
		size: { width: number; height: number; depth: number };
		position: Vector3;
	}[];
	coinSize: { halfHeight: number; radius: number };
	snapshot?: Uint8Array;
}

export const PHYSICS_SCALING_FACTOR = 100;

export interface CoinState {
	translation: Vector3;
	rotation: Quaternion;
}

type SnapshotCallback = (
	frame: number,
) => ((snapshot: Uint8Array) => void) | undefined;

export class CoinDozerWorld {
	rapier: Rapier;
	world: InstanceType<Rapier["World"]>;
	config: CoinDozerWorldConfig;
	frame = 0;
	accumulator = 0;
	prevCoinStates: CoinState[] = [];
	currentCoinStates: CoinState[] = [];
	coinBodies: InstanceType<Rapier["RigidBody"]>[] = [];
	snapshotSubscribers: SnapshotCallback[] = [];
	interval?: NodeJS.Timer;

	constructor(rapier: Rapier, config: CoinDozerWorldConfig) {
		this.rapier = rapier;
		if (config.snapshot !== undefined) {
			this.world = rapier.World.restoreSnapshot(config.snapshot);
		} else {
			this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
		}
		this.config = config;
		this.#setup();
	}

	start() {
		if (this.interval) {
			return;
		}

		this.interval = setInterval(
			this.#update.bind(this),
			1000 / this.config.fps,
		);
	}

	pause() {
		if (!this.interval) {
			return;
		}

		clearInterval(this.interval);
		this.interval = undefined;
	}

	addCoin() {
		const bodyDesc = this.rapier.RigidBodyDesc.dynamic().setTranslation(
			0,
			10 / PHYSICS_SCALING_FACTOR,
			0,
		);
		const body = this.world.createRigidBody(bodyDesc);

		const collider = this.rapier.ColliderDesc.cylinder(
			this.config.coinSize.halfHeight / PHYSICS_SCALING_FACTOR,
			this.config.coinSize.radius / PHYSICS_SCALING_FACTOR,
		);
		this.world.createCollider(collider, body);

		this.coinBodies.push(body);
		this.currentCoinStates.push({
			rotation: body.rotation(),
			translation: body.translation(),
		});
		return this.frame;
	}

	subscribeToSnapshots(callback: SnapshotCallback) {
		this.snapshotSubscribers.push(callback);
	}

	#setup() {
		const RAPIER = this.rapier;

		for (const cuboid of this.config.containerCuboids) {
			const { position, size } = cuboid;
			const colliderDesc = RAPIER.ColliderDesc.cuboid(
				size.width / 2 / PHYSICS_SCALING_FACTOR,
				size.height / 2 / PHYSICS_SCALING_FACTOR,
				size.depth / 2 / PHYSICS_SCALING_FACTOR,
			).setTranslation(
				position.x / PHYSICS_SCALING_FACTOR,
				position.y / PHYSICS_SCALING_FACTOR,
				position.z / PHYSICS_SCALING_FACTOR,
			);
			this.world.createCollider(colliderDesc);
		}
	}

	#update() {
		this.prevCoinStates = this.currentCoinStates;
		this.currentCoinStates = this.coinBodies.map((body) => ({
			rotation: body.rotation(),
			translation: body.translation(),
		}));
		this.accumulator = 0;

		const callbacks = this.snapshotSubscribers
			.map((subscriber) => subscriber(this.frame))
			.filter((callback) => callback !== undefined);

		if (callbacks.length > 0) {
			const snapshot = this.world.takeSnapshot();
			for (const callback of callbacks) {
				callback(snapshot);
			}
		}

		this.world.step();
		this.frame++;
	}
}
