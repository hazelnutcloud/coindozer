import type { Quaternion, Vector3 } from "@dimforge/rapier3d-compat";
import type { Action } from "svelte/action";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
	EffectComposer,
	OBJLoader,
	OutputPass,
	RenderPixelatedPass,
} from "three/examples/jsm/Addons.js";
import type { CoinDozerWorld } from "world";

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
	camera.position.set(0.3, 0.4, 0.3);

	const renderer = new THREE.WebGLRenderer({ canvas });
	renderer.setClearAlpha(0);
	renderer.setSize(width, height);
	renderer.shadowMap.enabled = true;

	const composer = new EffectComposer(renderer);
	const renderPixelatedPass = new RenderPixelatedPass(4, scene, camera);
	composer.addPass(renderPixelatedPass);

	const outputPass = new OutputPass();
	composer.addPass(outputPass);

	new OrbitControls(camera, canvas);

	window.addEventListener("resize", function resize() {
		if (!canvas.parentElement) return;
		const width = canvas.parentElement.clientWidth;
		const height = canvas.parentElement.clientHeight;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
		composer.setSize(width, height);
	});

	// const textureLoader = new THREE.TextureLoader();
	// const coinTexture = textureLoader.load("/textures/golden-flame-1x.png");
	// coinTexture.minFilter = THREE.NearestFilter;
	// coinTexture.magFilter = THREE.NearestFilter;

	let coinObj: THREE.Group<THREE.Object3DEventMap>;
	let coinInstanced: THREE.InstancedMesh<any, any, THREE.InstancedMeshEventMap>;

	const objLoader = new OBJLoader();
	objLoader.load("/objects/coin.obj", (obj) => {
		coinObj = obj;
		renderer.setAnimationLoop(animate);

		coinInstanced = createCoinInstaced(world.coinBodies.length);
		updateCoins(getInterpolatedState(1), coinInstanced);
		scene.add(coinInstanced);
	});

	// SCENE
	const ambientLight = new THREE.AmbientLight();
	scene.add(ambientLight);
	const directionalLight = new THREE.DirectionalLight();
	directionalLight.position.set(-1, 0.5, 1);
	directionalLight.castShadow = true;
	directionalLight.shadow.radius;
	directionalLight.shadow.camera.top = 0.3;
	directionalLight.shadow.camera.bottom = -0.3;
	directionalLight.shadow.camera.right = 0.3;
	directionalLight.shadow.camera.left = -0.3;
	scene.add(directionalLight);

	for (const cuboid of world.config.containerCuboids) {
		const geometry = new THREE.BoxGeometry(
			cuboid.size.width,
			cuboid.size.height,
			cuboid.size.depth,
		);
		const material = new THREE.MeshStandardMaterial({ color: "green" });
		const mesh = new THREE.Mesh(geometry, material);
		mesh.receiveShadow = true;
		mesh.position.set(cuboid.position.x, cuboid.position.y, cuboid.position.z);
		scene.add(mesh);
	}

	function createCoinInstaced(length: number) {
		const instanced = new THREE.InstancedMesh(
			// new THREE.CylinderGeometry(
			// 	world.config.coinSize.radius,
			// 	world.config.coinSize.radius,
			// 	world.config.coinSize.halfHeight * 2,
			// ),
			// new THREE.MeshPhongMaterial({ color: "gold" }),
			coinObj.children[0].geometry,
			// coinObj.children[0].material,
			new THREE.MeshPhongMaterial({ color: "gold" }),
			length,
		);
		instanced.castShadow = true;
		instanced.receiveShadow = true;
		instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		return instanced;
	}

	type CoinState = {
		translation: Vector3;
		rotation: Quaternion;
	};

	let prevCoinStates: CoinState[] = [];
	let currentCoinStates: CoinState[] = [];

	world.subscribeToUpdates(() => {
		prevCoinStates = currentCoinStates;
		currentCoinStates = world.coinBodies.map((body) => ({
			translation: body.translation(),
			rotation: body.rotation(),
		}));
	});

	function getInterpolatedState(alpha: number) {
		return currentCoinStates.map((current, index) => {
			const previous = prevCoinStates[index] as CoinState | undefined;
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
      dummy.scale.set(0.06, 0.06, 0.06)
			dummy.updateMatrix();
			coinInstanced.setMatrixAt(index, dummy.matrix);
		}
		coinInstanced.instanceMatrix.needsUpdate = true;
		coinInstanced.computeBoundingBox();
	}

	console.log(world.coinBodies.length);

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
		const interpolatedState = getInterpolatedState(alpha);
		updateCoins(interpolatedState, coinInstanced);

		composer.render();
	}

	// renderer.setAnimationLoop(animate);

	return {
		update: ({ world }) => {
			if (world.coinBodies.length === coinInstanced.count) {
				return;
			}
			coinInstanced.removeFromParent();
			coinInstanced.dispose();

			coinInstanced = createCoinInstaced(world.coinBodies.length);
			updateCoins(getInterpolatedState(1), coinInstanced);
			scene.add(coinInstanced);
		},
		destroy: () => {
			scene.clear();

			coinInstanced.dispose();
		},
	};
};
