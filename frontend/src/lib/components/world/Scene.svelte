<script lang="ts">
  import { base64ToUint8Array } from "$lib/decode";
  import rapier, {
    type RigidBody,
    type World,
  } from "@dimforge/rapier3d-compat";
  import { T, useTask, useStage, useThrelte } from "@threlte/core";
  import { OrbitControls } from "@threlte/extras";
  import { Quaternion } from "three";
  import { lerp } from "three/src/math/MathUtils.js";
  import {
    defaultWorldConfig,
    initWorld,
    addCoin as worldAddCoin,
  } from "common";

  type CoinState = {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };

  const coinBodies: RigidBody[] = [];
  const worldConfig = $state(defaultWorldConfig);
  const worldStepTime = 1 / worldConfig.fps;
  const pendingCoins: Record<number, { frame: number }[]> = {};
  let prevCoinStates: CoinState[] = coinBodies.map((body) => ({
    translation: body.translation(),
    rotation: body.rotation(),
  }));
  let currCoinStates: CoinState[] = prevCoinStates;
  let interpolatedCoinStates: CoinState[] = $state.raw(currCoinStates);
  let accumulator = 0;
  let currentFrame = 0;
  let world: World | undefined = undefined;
  let syncCorrectionTime = 0;
  const syncCorrectionRate = 0.01;

  export const addCoin = (addToFrame: number) => {
    const addPendingCoin = () => {
      if (!pendingCoins[addToFrame]) {
        pendingCoins[addToFrame] = [{ frame: addToFrame }];
      } else {
        pendingCoins[addToFrame].push({ frame: addToFrame });
      }
    };

    if (!world) {
      addPendingCoin();
      return;
    }

    if (addToFrame > currentFrame) {
      addPendingCoin();
    } else if (addToFrame === currentFrame) {
      const body = worldAddCoin({ config: worldConfig, rapier, world });
      coinBodies.push(body);
    } else {
      // TODO: handle this case
      console.error("OUT OF SYNC");
      location.reload();
    }
  };
  export const init = async (params: { base64Data: string; frame: number }) => {
    if (world !== undefined) {
      return;
    }

    const snapshot = base64ToUint8Array(params.base64Data);
    await rapier.init();

    worldConfig.snapshot = snapshot;
    world = initWorld({
      config: worldConfig,
      rapier,
    });
    currentFrame = params.frame;
    world.forEachActiveRigidBody((body) => {
      // TODO: handle different types of rigid bodies by handle (server need to send more info)
      coinBodies.push(body);
    });
  };
  export const updateRemoteFrame = (params: {
    frame: number;
  }) => {
    const frameDifference = params.frame - currentFrame;
    const lockStepDifference = frameDifference - worldConfig.lockstepFrameDelay;
    syncCorrectionTime += lockStepDifference * worldStepTime;
  };

  const { mainStage } = useThrelte();
  const physicsStage = useStage("physics-stage", {
    before: mainStage,
    callback(delta, runTasks) {
      const cappedDelta = delta > 0.25 ? 0.25 : delta;
      const correction = syncCorrectionTime * syncCorrectionRate;
      const correctedDelta = Math.max(cappedDelta + correction, 0);
      syncCorrectionTime -= correctedDelta - delta;
      accumulator += correctedDelta;
      while (accumulator >= worldStepTime) {
        accumulator -= worldStepTime;
        runTasks(worldStepTime);
      }
    },
  });

  useTask(
    "physics-update",
    () => {
      if (!world) return;

      const frameSnapshot = currentFrame;

      if (pendingCoins[frameSnapshot] !== undefined) {
        for (const { frame } of pendingCoins[frameSnapshot]) {
          addCoin(frame);
        }
        delete pendingCoins[frameSnapshot];
      }

      world.step();

      prevCoinStates = currCoinStates;
      currCoinStates = coinBodies.map((body) => ({
        translation: body.translation(),
        rotation: body.rotation(),
      }));

      currentFrame++;
    },
    { stage: physicsStage },
  );

  useTask("coins-update", () => {
    if (!world) return;
    const alpha = accumulator / worldStepTime;

    interpolatedCoinStates = currCoinStates.map(
      ({ rotation, translation }, i) => {
        const prevCoinState = prevCoinStates[i] as CoinState | undefined;
        const newQuaternions = [rotation.x, rotation.y, rotation.z, rotation.w];
        if (prevCoinState) {
          Quaternion.slerpFlat(
            newQuaternions,
            0,
            [
              prevCoinState.rotation.x,
              prevCoinState.rotation.y,
              prevCoinState.rotation.z,
              prevCoinState.rotation.w,
            ],
            0,
            [rotation.x, rotation.y, rotation.z, rotation.w],
            0,
            alpha,
          );
        }
        return {
          translation: prevCoinState
            ? {
                x: lerp(prevCoinState.translation.x, translation.x, alpha),
                y: lerp(prevCoinState.translation.y, translation.y, alpha),
                z: lerp(prevCoinState.translation.z, translation.z, alpha),
              }
            : translation,
          rotation: {
            x: newQuaternions[0],
            y: newQuaternions[1],
            z: newQuaternions[2],
            w: newQuaternions[3],
          },
        };
      },
    );
  });
</script>

<T.PerspectiveCamera
  position={[0.5, 0.7, 0.5]}
  oncreate={(ref) => ref.lookAt(0, 0, 0)}
  makeDefault
>
  <OrbitControls />
</T.PerspectiveCamera>

<T.AmbientLight></T.AmbientLight>
<T.DirectionalLight position={[-1, 0.5, 1]}></T.DirectionalLight>

{#each worldConfig.containerCuboids as cuboid}
  <T.Mesh>
    <T.BoxGeometry
      args={[cuboid.size.width, cuboid.size.height, cuboid.size.depth]}
    ></T.BoxGeometry>
    <T.MeshStandardMaterial color="green"></T.MeshStandardMaterial>
  </T.Mesh>
{/each}

{#each interpolatedCoinStates as { rotation, translation }}
  <T.Mesh
    position={[translation.x, translation.y, translation.z]}
    quaternion={[rotation.x, rotation.y, rotation.z, rotation.w]}
  >
    <T.CylinderGeometry
      args={[
        worldConfig.coinSize.radius,
        worldConfig.coinSize.radius,
        worldConfig.coinSize.halfHeight * 2,
      ]}
    ></T.CylinderGeometry>
    <T.MeshStandardMaterial color="gold"></T.MeshStandardMaterial></T.Mesh
  >
{/each}
