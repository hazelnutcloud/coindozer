import type { Quaternion, Vector3 } from "@dimforge/rapier3d-compat";

type Rapier = typeof import("@dimforge/rapier3d-compat")["default"];

export { defaultWorldConfig } from "./config";

export interface CoinDozerWorldConfig {
	fps: number;
	containerCuboids: {
		size: { width: number; height: number; depth: number };
		position: Vector3;
	}[];
	coinSize: { halfHeight: number; radius: number };
	snapshot?: Uint8Array;
	frame?: number;
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
	frame;
	accumulator = 0;
	prevCoinStates: CoinState[] = [];
	currentCoinStates: CoinState[] = [];
	coinBodies: InstanceType<Rapier["RigidBody"]>[] = [];
	snapshotSubscribers: SnapshotCallback[] = [];
	coinSubscribers: (() => void)[] = [];
	pendingCoins: Record<number, { frame: number }[]> = {};
	interval?: NodeJS.Timer;

	constructor(rapier: Rapier, config: CoinDozerWorldConfig) {
		this.rapier = rapier;
		if (config.snapshot !== undefined) {
			this.world = rapier.World.restoreSnapshot(config.snapshot);
		} else {
			this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
		}
		this.world.forEachRigidBody((body) => this.coinBodies.push(body));
		this.frame = config.frame ?? 0;
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

	addCoin(frame?: number) {
		if (frame) {
			if (frame < this.frame) {
				// TODO: handle case where frame is less than this.frame
				throw new Error("Out of sync!");
			}
			if (this.pendingCoins[frame] === undefined) {
				this.pendingCoins[frame] = [{ frame }];
			} else {
				this.pendingCoins[frame].push({ frame });
			}
			return this.frame;
		}

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
		if (this.coinSubscribers.length > 0) {
			for (const subscriber of this.coinSubscribers) {
				subscriber();
			}
		}
		return this.frame;
	}

	subscribeToSnapshots(callback: SnapshotCallback) {
		this.snapshotSubscribers.push(callback);
	}

	subscribeToCoinAdded(callback: () => void) {
		this.coinSubscribers.push(callback);
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
		if (this.pendingCoins[this.frame] !== undefined) {
			for (const pendingCoin of this.pendingCoins[this.frame]) {
				this.addCoin();
			}
			delete this.pendingCoins[this.frame];
		}

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
