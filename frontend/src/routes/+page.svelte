<script lang="ts">
  import { scene } from "$lib/scene";
  import { onMount } from "svelte";
  import { CoinDozerWorld, defaultWorldConfig, SYNC_CHECK_FRAMES } from "world";
  import type { ClientPacket, ServerPacket } from "server";
  import { base64ToUint8Array } from "$lib/decode";
  import rapier from "@dimforge/rapier3d-compat";

  let world: CoinDozerWorld | undefined = $state();
  let ws: WebSocket | undefined;

  const pendingCoinsBuffer: { frame: number }[] = [];
  const worldHashes: { timestamp: number; hash: string }[] = [];

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

      // // biome-ignore lint/correctness/noSelfAssign: <explanation>
      // world = world;

      // world.subscribeToCoinAdded(() => {
      //   // biome-ignore lint/correctness/noSelfAssign: <explanation>
      //   world = world;
      // });

      world.subscribeToUpdates((frame) => {
        if (frame % SYNC_CHECK_FRAMES !== 0) {
          return;
        }
        if (!world) return;

        const snapshot = world.takeSnapshot();

        crypto.subtle.digest("SHA-1", snapshot).then((hash) => {
          const hashArray = Array.from(new Uint8Array(hash));
          const hashHex = hashArray
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const remoteHash = worldHashes[frame];

          if (remoteHash && remoteHash.hash === hashHex) {
            console.log(`${frame} SYNCED`);
            const delay = performance.now() - remoteHash.timestamp;
            console.log("lockstep delay:", delay, "ms");
          } else {
            console.error(`${frame} OUT OF SYNC`);
          }
          
          delete worldHashes[frame];
        });
      });
    } else if (packet.kind === "new-coin") {
      if (!world) {
        pendingCoinsBuffer.push({ frame: packet.frame });
        return;
      }
      world.addCoin(packet.frame);
    } else if (packet.kind === "world-hash") {
      worldHashes[packet.frame] = {
        hash: packet.hash,
        timestamp: performance.now(),
      };
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
    onclick={() => {
      handleClickNewCoin();
    }}>+ coin</button
  >
  {#if world}
    <canvas class="w-full h-full" use:scene={{ world }}></canvas>
  {/if}
</div>
