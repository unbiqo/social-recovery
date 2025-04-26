const WebSocket = require("ws");

const clientName = process.argv[2] || "Anonymous";
const accessToken = process.argv[3]; // Access token passed via command line

if (!accessToken) {
  console.error("Access token is required. Usage: node src/client.js <name> <token>");
  process.exit(1);
}

const client = new WebSocket("ws://localhost:8080");

client.on("open", () => {
  console.log(`${clientName} connected to server (acting as a trusted person holding a mnemonic share)`);
  // Authenticate with the server
  client.send(JSON.stringify({ type: "authenticate", name: clientName, token: accessToken }));
});

client.on("message", (message) => {
  try {
    const data = JSON.parse(message.toString());
    if (data.type === "receive_share") {
      console.log(`${clientName} received mnemonic share from server: ${data.share}`);
      client.mnemonicShare = data.share;
    } else if (data.type === "request_share") {
      console.log(`${clientName} server requested my share, sending: ${client.mnemonicShare}`);
      client.send(JSON.stringify({ type: "submit_share", share: client.mnemonicShare }));
    } else if (data.type === "recovery_complete") {
      console.log(`${clientName} server completed recovery, closing connection`);
      client.close();
    } else if (data.type === "error") {
      console.error(`${clientName} error from server: ${data.message}`);
      client.close();
    }
  } catch (error) {
    console.error(`${clientName} error processing message: ${error}`);
  }
});

client.on("close", () => {
  console.log(`${clientName} disconnected from server`);
});

client.on("error", (error) => {
  console.error(`${clientName} WebSocket error: ${error.message}`);
});