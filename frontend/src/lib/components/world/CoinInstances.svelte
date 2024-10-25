<script lang="ts">
  import { Instance } from "@threlte/extras";

  const {
    coinStates,
  }: {
    coinStates: {
      translation: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
    }[];
  } = $props();
</script>

{#each coinStates as { rotation, translation }}
  <Instance
    quaternion={[rotation.x, rotation.y, rotation.z, rotation.w]}
    position={[translation.x, translation.y, translation.z]}
  />
{/each}
