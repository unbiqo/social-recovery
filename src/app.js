const { testnet } = require("bitcore-lib/lib/networks");
const { createHDWallet, distributeAndRecoverShares, getWalletFromMnemonic } = require("./wallet.bitcoin");
const WebSocket = require("ws");
const readline = require("readline");

const wss = new WebSocket.Server({ port: 8080 });
console.log("WebSocket server running on ws://localhost:8080");
console.log("This server will send mnemonic shares to three clients (nodes) and collect them for recovery.");

const wallet = createHDWallet(testnet);
console.log("Original Wallet:", {
  address: wallet.address,
  mnemonic: wallet.mnemonic
});

// Distribute mnemonic shares to clients and handle recovery
const accessTokens = distributeAndRecoverShares(wss, wallet.mnemonic, (error, recoveredMnemonic) => {
  if (error) {
    console.error("Recovery failed:", error.message);
    return;
  }
  console.log("\nRecovered Mnemonic:", recoveredMnemonic);
  const restoredWallet = getWalletFromMnemonic(recoveredMnemonic, testnet);
  console.log("Restored Wallet:", restoredWallet);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("\nStart three clients to emulate the three people with their access tokens:");
console.log(`  In terminal 1: node src/client.js Alice ${accessTokens["Alice"]}`);
console.log(`  In terminal 2: node src/client.js Bob ${accessTokens["Bob"]}`);
console.log(`  In terminal 3: node src/client.js Charlie ${accessTokens["Charlie"]}`);
console.log("Then press Enter in this terminal to request shares and recover the mnemonic...");
console.log("(Recovery requires only 2 out of 3 clients to respond.)");
rl.on("line", () => {
  console.log("Triggering recovery by requesting shares from all clients...");
  wss.requestShares();
});

process.on("SIGINT", () => {
  console.log("\nShutting down server...");
  wss.close();
  rl.close();
  process.exit();
});