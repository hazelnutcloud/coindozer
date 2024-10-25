<script lang="ts">
  import { Canvas } from "@threlte/core";
  import Scene from "./Scene.svelte";
  import WebsocketComponent from "./Websocket.svelte";

  let ws: WebsocketComponent;
  let scene: ReturnType<typeof Scene>;
</script>

<WebsocketComponent
  bind:this={ws}
  onInit={(packet) => scene.init(packet)}
  onNewCoin={(packet) => {
    scene.addCoin(packet.frame);
  }}
  onWorldHash={(packet) => {
    scene.updateRemoteFrame(packet);
  }}
/>
<button class="absolute top-4 left-4 z-10" onclick={() => ws.sendNewCoin()}>
  + coin
</button>
<Canvas>
  <Scene bind:this={scene} />
</Canvas>
