import fs from 'fs';
import dotenv from 'dotenv';
import algosdk from 'algosdk';
import arc200 from 'arc200js';

dotenv.config();

// Hardcoded variables for easy editing
const algodToken = ""; // Your Algod API token
const algodServer = process.env.VOI_ALGOD_URL; // Address of your Algod node
const algodPort = ""; // Port of your Algod node
const tokenId = 6792305; // Replace with your actual tokenId
const transferAmount = 1; // The amount of tokens to transfer
const walletFilePath = './wallets.txt'; // Path to your wallets text file
const failedTransactionsFilePath = './failed.txt'; // Path for output file
const batchSize = 50;
const batchDelay = 1000; // Delay in milliseconds (1000ms = 1 second)

// Read wallets from file
function readWalletsFromFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.trim() !== '');
  } catch (error) {
    console.error("Error reading wallets file:", error);
    return [];
  }
}

// Write failed transactions to file
function writeFailedTransactionsToFile(filePath, failedTransactions) {
  try {
    fs.writeFileSync(filePath, failedTransactions.join('\n'), 'utf8');
  } catch (error) {
    console.error("Error writing failed transactions file:", error);
  }
}

// Chunk array into batches
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Delay for a specified time
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Send tokens asynchronously
async function sendVIAAsync(ciFunder, receiverAddress, amount) {
  try {
    const res = await ciFunder.arc200_transfer(receiverAddress, amount, false, false);
    if (!res || res.success === false) {
      throw new Error(res.error || "Transaction failed without specific error.");
    }
    return { success: true, address: receiverAddress, res };
  } catch (error) {
    return { success: false, address: receiverAddress, error: error.message };
  }
}

// Main function
async function main() {
  const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);
  const funderAccount = algosdk.mnemonicToSecretKey(process.env.VOI_WALLET_MNEMONIC);
  console.log("Funder Account Address:", funderAccount.addr);

  const ciFunder = new arc200(tokenId, algodClient, {
    acc: funderAccount,
    simulate: true,
    waitForConfirmation: true,
    formatBytes: true,
  });

  const wallets = readWalletsFromFile(walletFilePath);
  const walletBatches = chunkArray(wallets, batchSize);
  const failedTransactions = [];

  for (const batch of walletBatches) {
    const transferPromises = batch.map(walletAddress =>
      sendVIAAsync(ciFunder, walletAddress, transferAmount)
    );

    const results = await Promise.allSettled(transferPromises);
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        console.log(`Successfully transferred ${transferAmount} tokens to ${batch[index]}`);
      } else {
        console.error(`Failed to transfer ${transferAmount} tokens to ${batch[index]}: ${result.reason || result.value.error}`);
        failedTransactions.push(batch[index]);
      }
    });

    await delay(batchDelay);
  }

  if (failedTransactions.length > 0) {
    console.log("Failed Transactions:", failedTransactions.join(', '));
    writeFailedTransactionsToFile(failedTransactionsFilePath, failedTransactions);
  }
}

main().catch(console.error);
