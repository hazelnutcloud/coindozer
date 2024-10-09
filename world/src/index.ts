import type { Quaternion, Vector3 } from "@dimforge/rapier3d-compat";

type Rapier = typeof import("@dimforge/rapier3d-compat")["default"];

export { defaultWorldConfig, SYNC_CHECK_FRAMES } from "./config";

export interface CoinDozerWorldConfig {
	fps: number;
	containerCuboids: {
		size: { width: number; height: number; depth: number };
		position: Vector3;
	}[];
	coinSize: { halfHeight: number; radius: number };
	gravity: Vector3;
	coinDropY: number;
	snapshot?: Uint8Array;
	frame?: number;
}

export const PHYSICS_SCALING_FACTOR = 100;

type UpdateCallback = (frame: number) => void;

export class CoinDozerWorld {
	rapier: Rapier;
	world: InstanceType<Rapier["World"]>;
	config: CoinDozerWorldConfig;
	frame;
	coinBodies: InstanceType<Rapier["RigidBody"]>[] = [];
	updateSubscribers: UpdateCallback[] = [];
	coinSubscribers: (() => void)[] = [];
	pendingCoins: Record<number, { frame: number }[]> = {};
	currentSnapshot?: Uint8Array;

	constructor(rapier: Rapier, config: CoinDozerWorldConfig) {
		this.rapier = rapier;
		this.frame = config.frame ?? 0;
		this.config = config;
		if (config.snapshot !== undefined) {
			this.world = rapier.World.restoreSnapshot(config.snapshot);
			this.world.forEachRigidBody((body) => this.coinBodies.push(body));
		} else {
			this.world = new rapier.World(config.gravity);
			this.#setup();
		}
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
			this.config.coinDropY,
			0,
		);
		const body = this.world.createRigidBody(bodyDesc);

		const collider = this.rapier.ColliderDesc.cylinder(
			this.config.coinSize.halfHeight,
			this.config.coinSize.radius,
		);
		this.world.createCollider(collider, body);

		this.coinBodies.push(body);
		if (this.coinSubscribers.length > 0) {
			for (const subscriber of this.coinSubscribers) {
				subscriber();
			}
		}
		return this.frame;
	}

	subscribeToUpdates(callback: UpdateCallback) {
		this.updateSubscribers.push(callback);
	}

	subscribeToCoinAdded(callback: () => void) {
		this.coinSubscribers.push(callback);
	}

	#setup() {
		const RAPIER = this.rapier;

		for (const cuboid of this.config.containerCuboids) {
			const { position, size } = cuboid;
			const colliderDesc = RAPIER.ColliderDesc.cuboid(
				size.width / 2,
				size.height / 2,
				size.depth / 2,
			).setTranslation(position.x, position.y, position.z);
			this.world.createCollider(colliderDesc);
		}
	}

	takeSnapshot() {
		if (this.currentSnapshot) {
			return this.currentSnapshot;
		}
		this.currentSnapshot = this.world.takeSnapshot();
		return this.currentSnapshot;
	}

	update() {
		if (this.pendingCoins[this.frame] !== undefined) {
			for (const pendingCoin of this.pendingCoins[this.frame]) {
				this.addCoin();
			}
			delete this.pendingCoins[this.frame];
		}

		for (const subscriber of this.updateSubscribers) {
			subscriber(this.frame);
		}

		this.currentSnapshot = undefined;
		this.world.step();
		this.frame++;
	}
}
