// sending bitcoin
const fetch = (url, init) => import('node-fetch').then(module => module.default(url, init));
const bitcore = require("bitcore-lib");
const TESTNET = true;

module.exports = sendBitcoin = async (recieverAddress, amountToSend) => {
    try {
        const privateKey =
            "ee672c24b2e9b1cfd8aa64a6024d87ec3840f9dd6f558d6d2d33c3aa422d123e";
        const sourceAddress = "mi7oEWnd8tcNS656DBbqrmf3x2BCGcPmTk";
        const satoshiToSend = amountToSend * 100000000;
        let fee = 0;
        let inputCount = 0;
        let outputCount = 2;

        const transaction = new bitcore.Transaction();
        let totalAmountAvailable = 0;

        let inputs = [];
        const resp = await fetch(`https://mempool.space/testnet/api/address/${sourceAddress}/utxo`);
        const utxosData = await resp.json();
        console.log("Mempool.space API Response:", utxosData); // Log the raw response

        const utxos = utxosData.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
        }));
        console.log("UTXOs from Mempool.space:", utxos);

        for (const utxo of utxos) {
            let input = {};
            input.satoshis = utxo.value;
            input.script = bitcore.Script.buildPublicKeyHashOut(sourceAddress).toHex();
            input.address = sourceAddress;
            input.txId = utxo.txid;
            input.outputIndex = utxo.vout;
            totalAmountAvailable += utxo.value;
            inputCount += 1;
            inputs.push(input);
        }

        const transactionSize =
            inputCount * 180 + outputCount * 34 + 10 - inputCount;

        if (TESTNET) {
            fee = transactionSize * 1; // 1 sat/byte is fine for testnet
        } else {
            console.warn("Using a fixed fee for mainnet is not recommended. Implement dynamic fee fetching.");
            fee = transactionSize * 20; // Example fixed fee for mainnet (not recommended)
        }

        const totalCost = satoshiToSend + fee;
        console.log("Total Amount Available (satoshis):", totalAmountAvailable);
        console.log("Amount to Send (satoshis):", satoshiToSend);
        console.log("Input Count:", inputCount);
        console.log("Transaction Size (bytes):", transactionSize);
        console.log("Calculated Fee (satoshis):", Math.round(fee));
        console.log("Total Cost (satoshis):", totalCost);

        if (totalAmountAvailable - satoshiToSend - fee < 0) {
            throw new Error("Balance is too low for this transaction");
        }
        //Set transaction input
        transaction.from(inputs);

        // set the recieving address and the amount to send
        transaction.to(recieverAddress, satoshiToSend);

        // Set change address - Address to receive the left over funds after transfer
        transaction.change(sourceAddress);

        //manually set transaction fees: 20 satoshis per byte
        transaction.fee(Math.round(fee));

        // Sign transaction with your private key
        transaction.sign(privateKey);

        // serialize Transactions
        const serializedTransaction = transaction.serialize();
        console.log("Serialized Transaction:", serializedTransaction);

        // Send transaction using mempool.space API
        const result = await fetch(`https://mempool.space/testnet/api/tx`, {
            method: "POST",
            body: serializedTransaction,
            headers: { 'Content-Type': 'text/plain' }
        });
        console.log("Transaction Broadcast Result:", result);
        return await result.text();
    } catch (error) {
        return error;
    }
};