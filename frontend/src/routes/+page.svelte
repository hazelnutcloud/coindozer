<script lang="ts">
  import { scene } from "$lib/scene";
  import { onMount } from "svelte";
  import { CoinDozerWorld, defaultWorldConfig } from "world";
  import type { ClientPacket, ServerPacket } from "server";
  import { base64ToUint8Array } from "$lib/decode";
  import rapier from "@dimforge/rapier3d-compat";

  let world: CoinDozerWorld | undefined;
  let ws: WebSocket | undefined;

  const pendingCoinsBuffer: { frame: number }[] = [];

  const handleWsMessage = async (msg: MessageEvent<string>) => {
    const packet: ServerPacket = JSON.parse(msg.data);

    if (packet.kind === "init") {
      if (world !== undefined) {
        return;
      }

      const snapshot = base64ToUint8Array(packet.data);
      await rapier.init();

      world = new CoinDozerWorld(rapier, {
        ...defaultWorldConfig,
        snapshot,
        frame: packet.frame,
      });

      if (pendingCoinsBuffer.length > 0) {
        for (const coin of pendingCoinsBuffer) {
          world.addCoin(coin.frame);
        }
      }
      pendingCoinsBuffer.length = 0;

      // biome-ignore lint/correctness/noSelfAssign: <explanation>
      world = world;

      world.subscribeToCoinAdded(() => {
        // biome-ignore lint/correctness/noSelfAssign: <explanation>
        world = world;
      });

      world.start();
    } else if (packet.kind === "new-coin") {
      if (!world) {
        pendingCoinsBuffer.push({ frame: packet.frame });
        return;
      }
      world.addCoin(packet.frame);
    } else if (packet.kind === "error") {
      console.error("Error from websocket connection:", packet.message);
    }
  };

  const handleClickNewCoin = () => {
    if (!ws) return;

    const packet: ClientPacket = {
      kind: "add-coin",
    };

    ws.send(JSON.stringify(packet));
  };

  onMount(() => {
    ws = new WebSocket("ws://localhost:3000/world");
    ws.addEventListener("message", handleWsMessage);

    return () => {
      ws?.close();
    };
  });
</script>

<div class="relative w-full h-screen">
  <button
    class="absolute top-4 left-4"
    on:click={() => {
      handleClickNewCoin();
    }}>+ coin</button
  >
  {#if world}
    <canvas class="w-full h-full" use:scene={{ world }}></canvas>
  {/if}
</div>
