<script lang="ts">
  import type { RigidBody } from "@dimforge/rapier3d-compat";
  import { T, useTask, useStage, useThrelte } from "@threlte/core";
  import { OrbitControls, InstancedMesh, Instance } from "@threlte/extras";
  import { Quaternion } from "three";
  import { lerp } from "three/src/math/MathUtils.js";
  import type { WorldConfig } from "world";

  const {
    worldConfig,
    coinBodies,
    onWorldUpdate,
  }: {
    worldConfig: WorldConfig;
    coinBodies: RigidBody[];
    onWorldUpdate: () => void;
  } = $props();
  const worldStepTime = 1 / worldConfig.fps;

  type CoinState = {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
  let prevCoinStates: CoinState[] = coinBodies.map((body) => ({
    translation: body.translation(),
    rotation: body.rotation(),
  }));
  let currCoinStates: CoinState[] = prevCoinStates;
  let interpolatedCoinStates: CoinState[] = $state.raw(currCoinStates);
  let accumulator = 0;

  const { mainStage } = useThrelte();
  const physicsStage = useStage("physics-stage", { before: mainStage });

  useTask(
    "physics-update",
    (delta) => {
      accumulator += delta > 0.5 ? 0.5 : delta;

      while (accumulator >= worldStepTime) {
        onWorldUpdate();
        prevCoinStates = currCoinStates;
        currCoinStates = coinBodies.map((body) => ({
          translation: body.translation(),
          rotation: body.rotation(),
        }));
        accumulator -= worldStepTime;
      }
    },
    { stage: physicsStage },
  );

  useTask("coins-update", () => {
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

{#if interpolatedCoinStates.length > 0}
  <InstancedMesh>
    <T.CylinderGeometry
      args={[
        worldConfig.coinSize.radius,
        worldConfig.coinSize.radius,
        worldConfig.coinSize.halfHeight * 2,
      ]}
    ></T.CylinderGeometry>
    <T.MeshStandardMaterial color="gold"></T.MeshStandardMaterial>

    {#each interpolatedCoinStates as { rotation, translation }}
      <Instance
        quaternion={[rotation.x, rotation.y, rotation.z, rotation.w]}
        position={[translation.x, translation.y, translation.z]}
      />
    {/each}
  </InstancedMesh>
{/if}
