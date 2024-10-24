<script lang="ts">
  import {
    defaultWorldConfig,
    addCoin as worldAddCoin,
    initWorld,
    SYNC_CHECK_FRAMES,
  } from "world";
  import { base64ToUint8Array } from "$lib/decode";
  import rapier, {
    type World as RapierWorld,
    type RigidBody,
  } from "@dimforge/rapier3d-compat";
  import { Canvas } from "@threlte/core";
  import Scene from "$lib/components/world/Scene.svelte";
  import WebsocketComponent from "./Websocket.svelte";

  const pendingCoins: Record<number, { frame: number }[]> = {};
  const worldHashes: { timestamp: number; hash: string }[] = [];

  let ws: WebsocketComponent;
  let currentFrame = 0;
  let world: RapierWorld | undefined = undefined;

  const worldConfig = $state(defaultWorldConfig);
  const coinBodies: RigidBody[] = $state([]);

  const addCoin = (addToFrame: number) => {
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

  const onInit: WebsocketComponent["$$prop_def"]["onInit"] = async (packet) => {
    if (world !== undefined) {
      return;
    }

    const snapshot = base64ToUint8Array(packet.data);
    await rapier.init();

    worldConfig.snapshot = snapshot;
    world = initWorld({
      config: worldConfig,
      rapier,
    });
    currentFrame = packet.frame;
    world.forEachActiveRigidBody((body) => {
      // TODO: handle different types of rigid bodies by handle (server need to send more info)
      coinBodies.push(body);
    });
  };

  const onWorldUpdate = () => {
    if (!world) return;
    const frameSnapshot = currentFrame;

    if (pendingCoins[frameSnapshot] !== undefined) {
      for (const { frame } of pendingCoins[frameSnapshot]) {
        addCoin(frame);
      }
      delete pendingCoins[frameSnapshot];
    }

    if (frameSnapshot % SYNC_CHECK_FRAMES === 0) {
      checkRemoteSync(world, frameSnapshot);
    }

    world.step();
    currentFrame++;
  };

  const checkRemoteSync = (world: RapierWorld, currentFrame: number) => {
    const snapshot = world.takeSnapshot();

    crypto.subtle.digest("SHA-1", snapshot).then((hash) => {
      const hashArray = Array.from(new Uint8Array(hash));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const remoteHash = worldHashes[currentFrame];

      if (remoteHash && remoteHash.hash === hashHex) {
        console.log(`${currentFrame} SYNCED`);
        const delay = performance.now() - remoteHash.timestamp;
        console.log("lockstep delay:", delay, "ms");
      } else {
        console.error(`${currentFrame} OUT OF SYNC`);
      }

      delete worldHashes[currentFrame];
    });
  };
</script>

<WebsocketComponent
  bind:this={ws}
  {onInit}
  onNewCoin={(packet) => {
    addCoin(packet.frame);
  }}
  onWorldHash={(packet) => {
    worldHashes[packet.frame] = {
      hash: packet.hash,
      timestamp: performance.now(),
    };
  }}
/>
<button class="absolute top-4 left-4 z-10" onclick={() => ws.sendNewCoin()}>
  + coin
</button>
<Canvas>
  <Scene {worldConfig} {coinBodies} {onWorldUpdate} />
</Canvas>
