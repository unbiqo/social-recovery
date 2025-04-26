const WebSocket = require("ws");
const crypto = require("crypto");

// Generate random pre-shared keys
const peersList = ["Owner", "Alice", "Bob", "Charlie"];
const preSharedKeys = {};

peersList.forEach(peer => {
  const envKey = process.env[`${peer.toUpperCase()}_KEY`];
  if (envKey) {
    preSharedKeys[peer] = envKey;
  } else {
    const randomKey = crypto.randomBytes(16).toString("hex");
    preSharedKeys[peer] = randomKey;
  }
});

// Display the generated keys
console.log("Pre-shared keys (share these securely with the respective peers):");
Object.entries(preSharedKeys).forEach(([peer, key]) => {
  console.log(`${peer}: ${key}`);
});

const wss = new WebSocket.Server({ port: 8080 });
console.log("Signaling server running on ws://localhost:8080");

const peers = {};

wss.on("connection", (ws, req) => {
  console.log("New peer connected:", req.socket.remoteAddress);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { type, peerId, key, targetId, sdp, candidate } = data;

      if (type === "register") {
        if (!peerId || !key) {
          ws.send(JSON.stringify({ type: "error", message: "Peer ID and key are required" }));
          return;
        }

        if (!(peerId in preSharedKeys)) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid peer ID" }));
          return;
        }

        if (preSharedKeys[peerId] !== key) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid key for this peer ID" }));
          return;
        }

        if (peers[peerId]) {
          ws.send(JSON.stringify({ type: "error", message: "Peer ID already registered" }));
          return;
        }

        peers[peerId] = ws;
        ws.peerId = peerId;
        console.log(`Peer ${peerId} registered`);
        ws.send(JSON.stringify({ type: "register_success", peerId }));

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            const peerList = client.peerId === "Owner" 
              ? Object.keys(peers) 
              : peers["Owner"] ? ["Owner"] : [];
            client.send(JSON.stringify({ type: "peer_list", peers: peerList }));
          }
        });
      } else if (type === "offer" || type === "answer") {
        const target = peers[targetId];
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ type, peerId, sdp }));
        }
      } else if (type === "candidate") {
        const target = peers[targetId];
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ type, peerId, candidate }));
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
    }
  });

  ws.on("close", () => {
    if (ws.peerId) {
      console.log(`Peer ${ws.peerId} disconnected`);
      delete peers[ws.peerId];
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          const peerList = client.peerId === "Owner" 
            ? Object.keys(peers) 
            : peers["Owner"] ? ["Owner"] : [];
          client.send(JSON.stringify({ type: "peer_list", peers: peerList }));
        }
      });
    }
  });
});