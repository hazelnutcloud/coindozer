import { PHYSICS_SCALING_FACTOR, type CoinDozerWorld } from './world';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Action } from 'svelte/action';

// const instanceMultiple = 100;

export const scene: Action<
	HTMLCanvasElement,
	{ coins: CoinDozerWorld['coins']; config: CoinDozerWorld['config'] }
> = (canvas, params) => {
	// SETUP
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
	camera.position.set(50, 50, 50);

	const renderer = new THREE.WebGLRenderer({ canvas });
	renderer.setClearAlpha(0);
	renderer.setSize(width, height);

	new OrbitControls(camera, canvas);

	window.addEventListener('resize', function resize() {
		const width = canvas.parentElement!.clientWidth;
		const height = canvas.parentElement!.clientHeight;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
	});

	// SCENE
	for (const cuboid of params.config.containerCuboids) {
		const geometry = new THREE.BoxGeometry(
			cuboid.size.width,
			cuboid.size.height,
			cuboid.size.depth
		);
		const material = new THREE.MeshBasicMaterial({ color: 'green' });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(cuboid.position.x, cuboid.position.y, cuboid.position.z);
		scene.add(mesh);
	}

	function createCoinInstaced(length: number) {
		const instanced = new THREE.InstancedMesh(
			new THREE.CylinderGeometry(
				params.config.coinSize.radius,
				params.config.coinSize.radius,
				params.config.coinSize.halfHeight * 2
			),
			new THREE.MeshBasicMaterial({ color: 'gold' }),
			length
		);
		instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		return instanced;
	}
	function updateCoins(coins: CoinDozerWorld['coins'], coinInstanced: THREE.InstancedMesh) {
		const dummy = new THREE.Object3D();
		for (const [index, coin] of coins.entries()) {
			const position = coin.translation();
			const rotation = coin.rotation();
			dummy.position.set(position.x, position.y, position.z).multiplyScalar(PHYSICS_SCALING_FACTOR);
			dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
			dummy.updateMatrix();
			coinInstanced.setMatrixAt(index, dummy.matrix);
		}
		coinInstanced.instanceMatrix.needsUpdate = true;
		coinInstanced.computeBoundingBox();
	}

	let coinInstanced = createCoinInstaced(params.coins.length);
	updateCoins(params.coins, coinInstanced);
	scene.add(coinInstanced);

	// ANIMATE
	function animate() {
		renderer.render(scene, camera);
		updateCoins(params.coins, coinInstanced);
	}
	renderer.setAnimationLoop(animate);

	return {
		update: ({ coins }) => {
			coinInstanced.removeFromParent();
			coinInstanced.dispose();

			params.coins = coins;
			coinInstanced = createCoinInstaced(coins.length);

			updateCoins(coins, coinInstanced);
			scene.add(coinInstanced);
		},
		destroy: () => {
			scene.clear();

			coinInstanced.dispose();
		}
	};
};
