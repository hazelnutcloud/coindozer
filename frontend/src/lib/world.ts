import type { Vector3Like } from 'three';

type Rapier = Awaited<typeof import('@dimforge/rapier3d')>;

export interface CoinDozerWorldConfig {
	fps: number;
	containerCuboids: {
		size: { width: number; height: number; depth: number };
		position: Vector3Like;
	}[];
	coinSize: { halfHeight: number; radius: number };
}

export const PHYSICS_SCALING_FACTOR = 100;

export class CoinDozerWorld {
	rapier: Rapier;
	world: InstanceType<Rapier['World']>;
	frame = 0;
	config: CoinDozerWorldConfig;
	coins: InstanceType<Rapier['RigidBody']>[] = [];
	interval?: number;

	constructor(rapier: Rapier, config: CoinDozerWorldConfig) {
		this.rapier = rapier;
		this.world = new rapier.World({ x: 0, y: -9.81, z: 0 });
		this.config = config;
		this.#setup();
	}

	start() {
		if (this.interval) {
			return;
		}

		this.interval = setInterval(this.#update.bind(this), 1000 / this.config.fps);
	}

	pause() {
		if (!this.interval) {
			return;
		}

		clearInterval(this.interval);
		this.interval = undefined;
	}

	addCoin() {
		const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
			.setTranslation(0, 10 / PHYSICS_SCALING_FACTOR, 0)
			// .setCcdEnabled(true)
		const body = this.world.createRigidBody(bodyDesc);

		const collider = this.rapier.ColliderDesc.cylinder(
			this.config.coinSize.halfHeight / PHYSICS_SCALING_FACTOR,
			this.config.coinSize.radius / PHYSICS_SCALING_FACTOR
		);
		this.world.createCollider(collider, body);

		this.coins.push(body);
	}

	#setup() {
		const RAPIER = this.rapier;

		for (const cuboid of this.config.containerCuboids) {
			const { position, size } = cuboid;
			const colliderDesc = RAPIER.ColliderDesc.cuboid(
				size.width / 2 / PHYSICS_SCALING_FACTOR,
				size.height / 2 / PHYSICS_SCALING_FACTOR,
				size.depth / 2 / PHYSICS_SCALING_FACTOR
			).setTranslation(
				position.x / PHYSICS_SCALING_FACTOR,
				position.y / PHYSICS_SCALING_FACTOR,
				position.z / PHYSICS_SCALING_FACTOR
			);
			this.world.createCollider(colliderDesc);
		}
	}

	#update() {
		this.world.step();
		this.frame++;
	}
}
