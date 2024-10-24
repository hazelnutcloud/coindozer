<script lang="ts">
  import type { ClientPacket, ServerPacket } from "server";
  import { onMount } from "svelte";

  export const sendNewCoin = () => {
    if (!ws) return;

    const packet: ClientPacket = {
      kind: "add-coin",
    };

    ws.send(JSON.stringify(packet));
  };

  export let onInit: (packet: Extract<ServerPacket, { kind: "init" }>) => void;
  export let onNewCoin: (
    packet: Extract<ServerPacket, { kind: "new-coin" }>,
  ) => void;
  export let onWorldHash: (
    packet: Extract<ServerPacket, { kind: "world-hash" }>,
  ) => void;

  let ws: WebSocket | undefined;

  const handleWsMessage = async (msg: MessageEvent<string>) => {
    const packet: ServerPacket = JSON.parse(msg.data);

    if (packet.kind === "init") {
      onInit(packet);
    } else if (packet.kind === "new-coin") {
      onNewCoin(packet);
    } else if (packet.kind === "world-hash") {
      onWorldHash(packet);
    } else if (packet.kind === "error") {
      console.error("Error from websocket connection:", packet.message);
    }
  };

  onMount(() => {
    ws = new WebSocket("ws://localhost:3000/world");
    ws.addEventListener("message", handleWsMessage);

    return () => {
      ws?.close();
    };
  });
</script>
