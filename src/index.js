const express = require("express");
const path = require("path");
const {
  createHDWallet,
  getWalletFromMnemonic,
  splitMnemonicIntoShares,
  recoverMnemonicFromShares,
} = require("./wallet.bitcoin");
const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// API to generate a new wallet (server-side)
app.get("/generate-wallet", (req, res) => {
  try {
    const wallet = createHDWallet();
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API to recover a wallet from mnemonic (server-side)
app.post("/recover-wallet", (req, res) => {
  const { mnemonic } = req.body;
  if (!mnemonic) {
    return res.status(400).json({ error: "Mnemonic is required" });
  }

  try {
    const wallet = getWalletFromMnemonic(mnemonic);
    if (!wallet) {
      throw new Error("Failed to recover wallet from mnemonic");
    }
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API to split mnemonic into shares (server-side)
app.post("/split-shares", (req, res) => {
  const { mnemonic } = req.body;
  if (!mnemonic) {
    return res.status(400).json({ error: "Mnemonic is required" });
  }

  try {
    const shares = splitMnemonicIntoShares(mnemonic);
    if (!shares) {
      throw new Error("Failed to split mnemonic into shares");
    }
    res.json({ shares });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API to combine shares and recover mnemonic (server-side)
app.post("/combine-shares", (req, res) => {
  const { shares } = req.body;
  if (!shares || shares.length < 2) {
    return res.status(400).json({ error: "At least 2 shares are required" });
  }

  try {
    const mnemonic = recoverMnemonicFromShares(shares);
    if (!mnemonic) {
      throw new Error("Failed to recover mnemonic from shares");
    }
    res.json({ mnemonic });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitcoin Social Recovery (P2P)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .log-box { max-height: 200px; overflow-y: auto; }
  </style>
</head>
<body class="bg-gray-100 font-sans">
  <div class="container mx-auto p-6">
    <h1 class="text-3xl font-bold mb-6 text-center">Bitcoin Social Recovery (P2P)</h1>

    <!-- Peer Setup -->
    <div class="bg-white shadow-md rounded-lg p-4 mb-6">
      <h2 class="text-xl font-semibold mb-2">Setup Your Peer</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="peer-id" class="block text-sm font-medium text-gray-700">Your Peer ID (e.g., Owner, Alice, Bob, Charlie)</label>
          <input id="peer-id" type="text" placeholder="Enter your peer ID" class="w-full p-2 border rounded mb-2">
        </div>
        <div>
          <label for="peer-key" class="block text-sm font-medium text-gray-700">Pre-Shared Key</label>
          <input id="peer-key" type="password" placeholder="Enter your pre-shared key" class="w-full p-2 border rounded mb-2">
        </div>
        <div>
          <label for="access-token" class="block text-sm font-medium text-gray-700">Access Token (optional for trustees)</label>
          <input id="access-token" type="password" placeholder="Enter access token" class="w-full p-2 border rounded mb-2">
        </div>
      </div>
      <button id="register-btn" class="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">Register Peer</button>
      <p id="peer-status" class="mt-2 text-sm text-gray-600">Not registered</p>
    </div>

    <!-- Owner: Distribute Shares -->
    <div id="owner-section" class="bg-white shadow-md rounded-lg p-4 mb-6 hidden">
      <h2 class="text-xl font-semibold mb-2">Owner: Distribute Shares</h2>
      <div class="mb-4">
        <button id="generate-wallet-btn" class="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 mb-2">Generate New Wallet</button>
        <label for="mnemonic-input" class="block text-sm font-medium text-gray-700">Mnemonic Phrase (generate or enter manually)</label>
        <input id="mnemonic-input" type="text" placeholder="Enter 12-word mnemonic phrase" class="w-full p-2 border rounded mb-2">
      </div>
      <button id="distribute-shares-btn" class="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600" disabled>Distribute Shares</button>
      <p id="wallet-info" class="mt-2 text-sm"></p>
    </div>

    <!-- Connected Peers -->
    <div class="bg-white shadow-md rounded-lg p-4 mb-6">
      <h2 class="text-xl font-semibold mb-2">Connected Peers</h2>
      <ul id="peer-list" class="list-disc pl-5 text-sm"></ul>
    </div>

    <!-- Trustee: Share Storage -->
    <div id="trustee-section" class="bg-white shadow-md rounded-lg p-4 mb-6 hidden">
      <h2 class="text-xl font-semibold mb-2">Trustee: Stored Share</h2>
      <p id="stored-share" class="text-sm">No share received yet</p>
    </div>

    <!-- Owner: Recover Wallet -->
    <div id="recover-section" class="bg-white shadow-md rounded-lg p-4 mb-6 hidden">
      <h2 class="text-xl font-semibold mb-2">Owner: Recover Wallet</h2>
      <button id="recover-btn" class="bg-green-500 text-white py-2 px-4 rounded hover:bg-blue-600">Trigger Recovery</button>
    </div>

    <!-- Logs -->
    <div class="bg-white shadow-md rounded-lg p-4">
      <h2 class="text-xl font-semibold mb-2">Logs</h2>
      <div id="logs" class="log-box p-2 bg-gray-100 rounded text-sm"></div>
    </div>
  </div>

  <script>
    // Logging function
    function log(message) {
      const logsDiv = document.getElementById("logs");
      logsDiv.innerHTML += \`<p>\${message}</p>\`;
      logsDiv.scrollTop = logsDiv.scrollHeight;
    }

    // WebRTC signaling server URL
    const SIGNALING_SERVER_URL = "ws://localhost:8080";
    const PEER_ID = document.getElementById("peer-id");
    const PEER_KEY = document.getElementById("peer-key");
    const ACCESS_TOKEN = document.getElementById("access-token");
    const REGISTER_BUTTON = document.getElementById("register-btn");
    const PEER_STATUS = document.getElementById("peer-status");
    const OWNER_SECTION = document.getElementById("owner-section");
    const GENERATE_WALLET_BUTTON = document.getElementById("generate-wallet-btn");
    const MNEMONIC_INPUT = document.getElementById("mnemonic-input");
    const DISTRIBUTE_SHARES_BUTTON = document.getElementById("distribute-shares-btn");
    const WALLET_INFO = document.getElementById("wallet-info");
    const PEER_LIST = document.getElementById("peer-list");
    const TRUSTEE_SECTION = document.getElementById("trustee-section");
    const STORED_SHARE = document.getElementById("stored-share");
    const RECOVER_SECTION = document.getElementById("recover-section");
    const RECOVER_BUTTON = document.getElementById("recover-btn");

    let peerId = "";
    let accessToken = "";
    let ws = null;
    let connections = new Map(); // Store both peerConnection and dataChannel
    let storedShare = null;
    let connectedPeers = new Set();
    let walletAddress = null;
    let mnemonic = null;
    let walletRecovered = false; // Flag to track if wallet has been recovered

    REGISTER_BUTTON.addEventListener("click", async () => {
      peerId = PEER_ID.value.trim();
      const preSharedKey = PEER_KEY.value.trim();
      accessToken = ACCESS_TOKEN.value.trim();

      if (!peerId || !preSharedKey) {
        log("Peer ID and pre-shared key are required");
        return;
      }

      try {
        ws = new WebSocket(SIGNALING_SERVER_URL);

        ws.onopen = () => {
          log("Connected to signaling server");
          ws.send(JSON.stringify({ type: "register", peerId, key: preSharedKey }));
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "register_success":
              log(\`Successfully registered as \${peerId}\`);
              PEER_STATUS.textContent = \`Registered as \${peerId}\`;
              if (peerId.toLowerCase() === "owner") {
                OWNER_SECTION.classList.remove("hidden");
                RECOVER_SECTION.classList.remove("hidden");
              } else {
                TRUSTEE_SECTION.classList.remove("hidden");
                storedShare = null; // Reset stored share on registration
                STORED_SHARE.textContent = "No share received yet";
                if (accessToken) {
                  const tokenMessage = {
                    type: "access_token",
                    id: peerId,
                    token: accessToken,
                  };
                  ws.send(JSON.stringify(tokenMessage));
                }
              }
              break;

            case "peer_list":
              const peers = message.peers.filter((p) => p !== peerId);
              log(\`Visible peers: \${peers.join(", ")}\`);
              PEER_LIST.innerHTML = peers.map((p) => \`<li>\${p}</li>\`).join("");
              if (peerId.toLowerCase() === "owner") {
                // Remove peers that are no longer in the list
                const currentPeers = new Set(peers);
                for (const peer of connectedPeers) {
                  if (!currentPeers.has(peer)) {
                    log(\`Peer \${peer} disconnected, cleaning up connection\`);
                    const connection = connections.get(peer);
                    if (connection) {
                      connection.peerConnection.close();
                      connections.delete(peer);
                    }
                    connectedPeers.delete(peer);
                  }
                }
                // Initiate connections to new or reconnected peers
                peers.forEach((peer) => {
                  const connection = connections.get(peer);
                  if (!connection || connection.peerConnection.connectionState === "closed" || connection.dataChannel.readyState !== "open") {
                    if (connection) {
                      connections.delete(peer);
                      connectedPeers.delete(peer);
                    }
                    initiateDataChannel(peer);
                  }
                });
              }
              break;

            case "offer":
              if (peerId.toLowerCase() !== "owner") {
                handleOffer(message);
              }
              break;

            case "answer":
              if (peerId.toLowerCase() === "owner") {
                handleAnswer(message);
              }
              break;

            case "candidate":
              handleCandidate(message);
              break;

            case "share":
              if (peerId.toLowerCase() !== "owner") {
                storedShare = message.share;
                STORED_SHARE.textContent = \`Received share: \${storedShare}\`;
                log(\`Received share from Owner\`);
              }
              break;

            case "share_response":
              if (peerId.toLowerCase() === "owner") {
                handleShareResponse(message);
              }
              break;

            case "error":
              log(\`Error: \${message.message}\`);
              break;
          }
        };

        ws.onerror = (error) => {
          log(\`WebSocket error: \${error}\`);
        };

        ws.onclose = () => {
          log("Disconnected from signaling server");
          PEER_STATUS.textContent = "Disconnected";
          // Clean up all connections on WebSocket close
          connections.forEach((connection, peer) => {
            connection.peerConnection.close();
          });
          connections.clear();
          connectedPeers.clear();
        };
      } catch (error) {
        log(\`Error registering peer: \${error.message}\`);
      }
    });

    async function initiateDataChannel(peer) {
      try {
        const configuration = {
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        };
        const pc = new RTCPeerConnection(configuration);

        const dc = pc.createDataChannel("recovery");
        connections.set(peer, { peerConnection: pc, dataChannel: dc });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            ws.send(
              JSON.stringify({
                type: "candidate",
                peerId,
                targetId: peer,
                candidate: event.candidate,
              })
            );
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
            log(\`Connection to \${peer} \${pc.connectionState}\`);
            connections.delete(peer);
            connectedPeers.delete(peer);
            updateDistributeSharesButton();
          }
        };

        dc.onopen = () => {
          log(\`Data channel with \${peer} opened\`);
          connectedPeers.add(peer);
          updateDistributeSharesButton();
        };

        dc.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === "share_response") {
            handleShareResponse(message);
          }
        };

        dc.onclose = () => {
          log(\`Data channel with \${peer} closed\`);
          connectedPeers.delete(peer);
          connections.delete(peer);
          updateDistributeSharesButton();
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(
          JSON.stringify({
            type: "offer",
            peerId,
            targetId: peer,
            sdp: offer,
          })
        );
      } catch (error) {
        log(\`Error initiating data channel with \${peer}: \${error.message}\`);
      }
    }

    async function handleOffer(message) {
      try {
        const configuration = {
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        };
        const pc = new RTCPeerConnection(configuration);

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            ws.send(
              JSON.stringify({
                type: "candidate",
                peerId,
                targetId: message.peerId,
                candidate: event.candidate,
              })
            );
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
            log(\`Connection to \${message.peerId} \${pc.connectionState}\`);
            connections.delete(message.peerId);
          }
        };

        pc.ondatachannel = (event) => {
          const dc = event.channel;
          connections.set(message.peerId, { peerConnection: pc, dataChannel: dc });

          dc.onopen = () => {
            log(\`Data channel with \${message.peerId} opened\`);
          };

          dc.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "share") {
              storedShare = message.share;
              STORED_SHARE.textContent = \`Received share: \${storedShare}\`;
              log(\`Received share from \${message.from}\`);
            } else if (message.type === "request_share") {
              log(\`Received share request from \${message.from}\`);
              if (peerId.toLowerCase() !== "owner" && storedShare) {
                if (dc.readyState === "open") {
                  dc.send(
                    JSON.stringify({
                      type: "share_response",
                      share: storedShare,
                      from: peerId,
                    })
                  );
                  log(\`Sent share to Owner\`);
                } else {
                  log("Cannot send share to Owner - data channel not open");
                }
              } else {
                log("No share available to send to Owner");
              }
            }
          };

          dc.onclose = () => {
            log(\`Data channel with \${message.peerId} closed\`);
            connections.delete(message.peerId);
          };
        };

        await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(
          JSON.stringify({
            type: "answer",
            peerId,
            targetId: message.peerId,
            sdp: answer,
          })
        );
      } catch (error) {
        log(\`Error handling offer from \${message.peerId}: \${error.message}\`);
      }
    }

    async function handleAnswer(message) {
      try {
        const connection = connections.get(message.peerId);
        if (connection && connection.peerConnection) {
          await connection.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
        } else {
          log(\`No peer connection found for \${message.peerId}\`);
        }
      } catch (error) {
        log(\`Error handling answer from \${message.peerId}: \${error.message}\`);
      }
    }

    async function handleCandidate(message) {
      try {
        const connection = connections.get(message.peerId);
        if (connection && connection.peerConnection) {
          await connection.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
        } else {
          log(\`No peer connection found for \${message.peerId}\`);
        }
      } catch (error) {
        log(\`Error handling ICE candidate from \${message.peerId}: \${error.message}\`);
      }
    }

    function updateDistributeSharesButton() {
      if (peerId.toLowerCase() === "owner") {
        const connectedCount = connectedPeers.size;
        log(\`Distribute Shares button enabled: Connected to \${connectedCount}/3 trustees (\${Array.from(connectedPeers).join(", ")})\`);
        if (connectedCount >= 2 && MNEMONIC_INPUT.value.trim()) {
          DISTRIBUTE_SHARES_BUTTON.disabled = false;
        } else {
          DISTRIBUTE_SHARES_BUTTON.disabled = true;
        }
      }
    }

    MNEMONIC_INPUT.addEventListener("input", updateDistributeSharesButton);

    // Generate a new wallet on the server
    GENERATE_WALLET_BUTTON.addEventListener("click", async () => {
      try {
        const response = await fetch("/generate-wallet");
        const wallet = await response.json();
        if (wallet.error) {
          throw new Error(wallet.error);
        }
        MNEMONIC_INPUT.value = wallet.mnemonic;
        log(\`Generated wallet - Mnemonic: \${wallet.mnemonic}\`);
        log(\`Address: \${wallet.address}\`);
        updateDistributeSharesButton();
      } catch (error) {
        log(\`Error generating wallet: \${error.message}\`);
      }
    });

    DISTRIBUTE_SHARES_BUTTON.addEventListener("click", async () => {
      mnemonic = MNEMONIC_INPUT.value.trim();
      if (!mnemonic) {
        log("Mnemonic phrase is required");
        return;
      }

      try {
        // Recover wallet from mnemonic (server-side)
        const walletResponse = await fetch("/recover-wallet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mnemonic }),
        });

        const wallet = await walletResponse.json();
        if (wallet.error) {
          throw new Error(wallet.error);
        }

        walletAddress = wallet.address;
        log(\`Wallet recovered - Address: \${wallet.address}\`);
        WALLET_INFO.textContent = \`Wallet Address: \${wallet.address}\`;

        // Split mnemonic into shares (server-side)
        log(\`Splitting mnemonic into shares...\`);
        const sharesResponse = await fetch("/split-shares", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mnemonic }),
        });

        const { shares } = await sharesResponse.json();
        if (!shares) {
          throw new Error("Failed to split mnemonic into shares");
        }
        log(\`Successfully split mnemonic into shares\`);

        // Generate access tokens
        const accessTokens = {};
        const trusteeNames = ["Alice", "Bob", "Charlie"];
        for (let i = 0; i < 3; i++) {
          const token = Array.from(window.crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
          accessTokens[trusteeNames[i]] = token;
        }
        log("Access Tokens (share these with trustees securely):");
        log(JSON.stringify(accessTokens));

        const trustees = ["Alice", "Bob", "Charlie"];
        trustees.forEach((trustee, index) => {
          const connection = connections.get(trustee);
          if (connection && connection.dataChannel.readyState === "open") {
            connection.dataChannel.send(
              JSON.stringify({
                type: "share",
                share: shares[index],
                from: peerId,
              })
            );
            log(\`Sent share to \${trustee}\`);
          } else {
            log(\`Cannot send share to \${trustee} - not connected\`);
          }
        });
      } catch (error) {
        log(\`Error in Distribute Shares: \${error.message}\`);
      }
    });

    let receivedShares = [];

    RECOVER_BUTTON.addEventListener("click", () => {
      log("Requesting shares from trustees...");
      receivedShares = [];
      walletRecovered = false; // Reset the flag when starting a new recovery
      connections.forEach((connection, peer) => {
        if (connection.dataChannel.readyState === "open") {
          connection.dataChannel.send(
            JSON.stringify({
              type: "request_share",
              from: peerId,
            })
          );
          log(\`Requested share from \${peer}\`);
        } else {
          log(\`Cannot request share from \${peer} - data channel not open\`);
        }
      });
    });

    async function handleShareResponse(message) {
      log(\`Received share from \${message.from}\`);
      receivedShares.push(message.share);

      if (receivedShares.length >= 2 && !walletRecovered) {
        log(\`Combining shares to recover mnemonic...\`);
        try {
          // Combine shares (server-side)
          const combineResponse = await fetch("/combine-shares", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ shares: receivedShares.slice(0, 2) }),
          });

          const { mnemonic: recoveredMnemonic } = await combineResponse.json();
          if (!recoveredMnemonic) {
            throw new Error("Failed to combine shares");
          }
          log(\`Recovered mnemonic: \${recoveredMnemonic}\`);

          // Recover wallet from mnemonic (server-side)
          const walletResponse = await fetch("/recover-wallet", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ mnemonic: recoveredMnemonic }),
          });

          const wallet = await walletResponse.json();
          if (wallet.error) {
            throw new Error(wallet.error);
          }
          log(\`Recovered wallet - Address: \${wallet.address}\`);
          log(\`Private Key: \${wallet.privateKey}\`);
          walletRecovered = true; // Set the flag to prevent further recovery
        } catch (error) {
          log(\`Error recovering wallet: \${error.message}\`);
        }
      }
    }
  </script>
</body>
</html>
  `);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`UI server running on http://localhost:${port}`);
});