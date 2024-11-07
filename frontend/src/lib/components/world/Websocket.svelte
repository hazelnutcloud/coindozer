<script lang="ts">
  import type { ClientPacket, ServerPacket } from "common";
  import { onMount } from "svelte";
  import { PUBLIC_SERVER_URL } from "$env/static/public";

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
      console.log("Client: new-coin", packet);
      onNewCoin(packet);
    } else if (packet.kind === "world-hash") {
      onWorldHash(packet);
      console.log("Client: world-hash", packet);
    } else if (packet.kind === "error") {
      console.error("Error from websocket connection:", packet.message);
    }
  };

  onMount(() => {
    ws = new WebSocket(`${PUBLIC_SERVER_URL}/world`);
    ws.addEventListener("message", handleWsMessage);

    return () => {
      ws?.close();
    };
  });
</script>
