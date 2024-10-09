import type { Action } from "svelte/action";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CoinDozerWorld, CoinState } from "world";

export const scene: Action<HTMLCanvasElement, { world: CoinDozerWorld }> = (
	canvas,
	params,
) => {
	const { world } = params;

	// SETUP
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera(75, width / height, 0.001, 1000);
	camera.position.set(0.5, 0.5, 0.5);

	const renderer = new THREE.WebGLRenderer({ canvas });
	renderer.setClearAlpha(0);
	renderer.setSize(width, height);

	new OrbitControls(camera, canvas);

	window.addEventListener("resize", function resize() {
		if (!canvas.parentElement) return;
		const width = canvas.parentElement.clientWidth;
		const height = canvas.parentElement.clientHeight;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
	});

	// SCENE
	for (const cuboid of world.config.containerCuboids) {
		const geometry = new THREE.BoxGeometry(
			cuboid.size.width,
			cuboid.size.height,
			cuboid.size.depth,
		);
		const material = new THREE.MeshBasicMaterial({ color: "green" });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(cuboid.position.x, cuboid.position.y, cuboid.position.z);
		scene.add(mesh);
	}

	function createCoinInstaced(length: number) {
		const instanced = new THREE.InstancedMesh(
			new THREE.CylinderGeometry(
				world.config.coinSize.radius,
				world.config.coinSize.radius,
				world.config.coinSize.halfHeight * 2,
			),
			new THREE.MeshBasicMaterial({ color: "gold" }),
			length,
		);
		instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		return instanced;
	}

	function getInterpolatedState(world: CoinDozerWorld, alpha: number) {
		return world.currentCoinStates.map((current, index) => {
			const previous = world.prevCoinStates[index] as CoinState | undefined;
			return {
				translation: new THREE.Vector3().lerpVectors(
					previous?.translation ?? current.translation,
					current.translation,
					alpha,
				),
				rotation: new THREE.Quaternion().slerpQuaternions(
					new THREE.Quaternion().fromArray(
						Object.values(previous?.rotation ?? current.rotation),
					),
					new THREE.Quaternion().fromArray(Object.values(current.rotation)),
					alpha,
				),
			};
		});
	}

	function updateCoins(
		interpolatedCoins: ReturnType<typeof getInterpolatedState>,
		coinInstanced: THREE.InstancedMesh,
	) {
		const dummy = new THREE.Object3D();
		for (const [index, coin] of interpolatedCoins.entries()) {
			dummy.position.copy(coin.translation);
			dummy.quaternion.copy(coin.rotation);
			dummy.updateMatrix();
			coinInstanced.setMatrixAt(index, dummy.matrix);
		}
		coinInstanced.instanceMatrix.needsUpdate = true;
		coinInstanced.computeBoundingBox();
	}

	let coinInstanced = createCoinInstaced(world.coinBodies.length);
	updateCoins(getInterpolatedState(world, 1), coinInstanced);
	scene.add(coinInstanced);

	// ANIMATE
	let lastTime: number | null = null;
	const worldStepTime = 1000 / world.config.fps;
	let accumulator = 0;

	function animate(currentTime: number) {
		if (lastTime === null) lastTime = currentTime;
		let frameTime = currentTime - lastTime;
		lastTime = currentTime;

		if (frameTime > 250) frameTime = 250;

		accumulator += frameTime;

		while (accumulator >= worldStepTime) {
			world.update();
			accumulator -= worldStepTime;
		}

		const alpha = accumulator / worldStepTime;
		const interpolatedState = getInterpolatedState(world, alpha);
		updateCoins(interpolatedState, coinInstanced);

		renderer.render(scene, camera);
	}

	renderer.setAnimationLoop(animate);

	return {
		update: ({ world }) => {
			if (world.coinBodies.length === coinInstanced.count) {
				return;
			}
			coinInstanced.removeFromParent();
			coinInstanced.dispose();

			coinInstanced = createCoinInstaced(world.coinBodies.length);
			updateCoins(getInterpolatedState(world, 1), coinInstanced);
			scene.add(coinInstanced);
		},
		destroy: () => {
			scene.clear();

			coinInstanced.dispose();
		},
	};
};
