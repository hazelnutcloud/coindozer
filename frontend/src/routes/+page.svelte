<script lang="ts">
  import { scene } from "$lib/scene";
  import { onMount } from "svelte";
  import { CoinDozerWorld, defaultWorldConfig } from "world";

  let world: CoinDozerWorld;

  onMount(async () => {
    world = new CoinDozerWorld(
      await import("@dimforge/rapier3d"),
      defaultWorldConfig
    );
    world.start();
  });
</script>

<div class="relative w-full h-screen">
  <button
    class="absolute top-4 left-4"
    on:click={() => {
      world.addCoin();
      world = world;
    }}>+ coin</button
  >
  {#if world}
    <canvas class="w-full h-full" use:scene={{ world }}></canvas>
  {/if}
</div>
