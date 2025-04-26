const { PrivateKey } = require("bitcore-lib");
const { mainnet, testnet } = require("bitcore-lib/lib/networks");
const bip39 = require("bip39");
const bitcore = require("bitcore-lib");
const secrets = require("secrets.js-grempe");
const crypto = require("crypto");

const createWallet = (network = mainnet) => {
  var privateKey = new PrivateKey();
  var address = privateKey.toAddress(network);
  return {
    privateKey: privateKey.toString(),
    address: address.toString(),
  };
};

const createHDWallet = (network = testnet) => {
  let mnemonic;
  let attempts = 0;
  const maxAttempts = 10;

  // Keep generating mnemonics until a valid one is found
  do {
    attempts++;
    mnemonic = bip39.generateMnemonic(128);
    if (attempts > maxAttempts) {
      throw new Error(`Failed to generate a valid mnemonic after ${maxAttempts} attempts`);
    }
  } while (!bip39.validateMnemonic(mnemonic));

  console.log(`Generated mnemonic (attempt ${attempts}): ${mnemonic}`);

  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bitcore.HDPrivateKey.fromSeed(seed, network);
  const derived = root.deriveChild("m/44'/1'/0'/0/0");

  return {
    privateKey: derived.privateKey.toString(),
    address: derived.publicKey.toAddress(network).toString(),
    mnemonic: mnemonic,
  };
};

const getWalletFromMnemonic = (mnemonic, network = testnet) => {
  try {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bitcore.HDPrivateKey.fromSeed(seed, network);
    const derived = root.deriveChild("m/44'/1'/0'/0/0");
    return {
      privateKey: derived.privateKey.toString(),
      address: derived.publicKey.toAddress(network).toString(),
    };
  } catch (error) {
    console.error("Error deriving wallet from mnemonic:", error);
    return null;
  }
};

const splitMnemonicIntoShares = (mnemonic) => {
  try {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }
    const words = mnemonic.split(" ");
    if (words.length !== 12) {
      throw new Error("Mnemonic must be 12 words");
    }

    const entropy = bip39.mnemonicToEntropy(mnemonic);
    const shares = secrets.share(entropy, 3, 2);
    return shares;
  } catch (error) {
    console.error("Error splitting mnemonic into shares:", error);
    return null;
  }
};

const recoverMnemonicFromShares = (shares) => {
  try {
    if (shares.length < 2) {
      throw new Error("Need at least 2 shares to recover mnemonic");
    }

    const entropy = secrets.combine(shares);
    const mnemonic = bip39.entropyToMnemonic(entropy);
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid reconstructed mnemonic");
    }
    return mnemonic;
  } catch (error) {
    console.error("Error recovering mnemonic from shares:", error);
    return null;
  }
};

const generateAccessTokens = (numTokens) => {
  const tokens = {};
  const trusteeNames = ["Alice", "Bob", "Charlie"];
  for (let i = 0; i < numTokens; i++) {
    const token = crypto.randomBytes(16).toString("hex");
    tokens[trusteeNames[i]] = token;
  }
  return tokens;
};

const distributeAndRecoverShares = (mnemonic, onConnection, onRequestShares) => {
  const shares = splitMnemonicIntoShares(mnemonic);
  if (!shares) {
    throw new Error("Failed to split mnemonic into shares");
  }
  console.log("Mnemonic shares to distribute:", shares);

  const accessTokens = generateAccessTokens(3);
  console.log("Access Tokens (share these with trustees securely):", accessTokens);

  let clients = {};
  let receivedShares = [];

  const handleConnection = (ws, req) => {
    let clientName = null;
    let clientId = req.headers["sec-websocket-key"] || Object.keys(clients).length;

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "authenticate") {
          const { token, name } = data;
          if (!token || !name) {
            ws.send(JSON.stringify({ type: "error", message: "Token and name required" }));
            ws.close();
            return;
          }

          if (accessTokens[name] && accessTokens[name] === token) {
            if (clients[name]) {
              ws.send(JSON.stringify({ type: "error", message: `${name} is already connected` }));
              ws.close();
              return;
            }

            clientName = name;
            clientId = name;
            clients[name] = ws;

            const shareIndex = Object.keys(clients).length - 1;
            ws.share = shares[shareIndex];
            ws.send(JSON.stringify({ type: "receive_share", share: shares[shareIndex], shareIndex }));
            console.log(`Sent share ${shareIndex + 1} to ${name}`);
          } else {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token or name" }));
            ws.close();
          }
        }

        if (data.type === "submit_share" && data.share && clientName) {
          console.log(`Received share from ${clientName}: ${data.share}`);
          receivedShares.push(data.share);
          if (receivedShares.length >= 2) {
            const recoveredMnemonic = recoverMnemonicFromShares(receivedShares);
            onRequestShares(null, recoveredMnemonic);
            Object.keys(clients).forEach((name) => {
              const client = clients[name];
              client.send(JSON.stringify({ type: "recovery_complete" }));
              client.close();
            });
            clients = {};
            receivedShares = [];
          }
        }
      } catch (error) {
        console.error(`Error processing message from client ${clientId}:`, error);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      if (clientName) {
        console.log(`${clientName} disconnected`);
        delete clients[clientName];
      }
    });
  };

  const requestShares = () => {
    if (Object.keys(clients).length < 2) {
      onRequestShares(new Error(`Only ${Object.keys(clients).length} clients connected, need at least 2`), null);
      return;
    }
    console.log("Requesting shares from all clients");
    Object.keys(clients).forEach((name) => {
      const client = clients[name];
      client.send(JSON.stringify({ type: "request_share" }));
      console.log(`Requested share from ${name}`);
    });
  };

  onConnection(handleConnection);
  return { accessTokens, requestShares };
};

module.exports = {
  createHDWallet,
  createWallet,
  getWalletFromMnemonic,
  splitMnemonicIntoShares,
  recoverMnemonicFromShares,
  distributeAndRecoverShares,
};