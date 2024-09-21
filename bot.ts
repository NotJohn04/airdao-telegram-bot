import TelegramBot from "node-telegram-bot-api";
import { Account, createWalletClient, formatEther, http, parseEther, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { erc20Abi } from "viem";
import AirDaoTokenAbi from "./abi/AirDaoToken.json";
import { ADTBytecode } from "./constants/AirDaoTokenByteCode";

const token = "7827805708:AAEKBqIE56ggcH3TVZGCe_O5ZBvXVV_V5_E";
const bot = new TelegramBot(token, { polling: true });

const walletClients: { [key: number]: any } = {};

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Welcome! Use /createwallet to create a new wallet or /importwallet <private_key> to import an existing one."
  );
});

let account: Account;

bot.onText(/\/createwallet/, async (msg) => {
  const chatId = msg.chat.id;
  const privateKey = generatePrivateKey();
  account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    transport: http("https://network.ambrosus-test.io"),
  }).extend(publicActions);

  walletClients[chatId] = client;

  bot.sendMessage(
    chatId,
    `Wallet created!\nAddress: ${account.address}\nPrivate Key: ${privateKey}\n\nKeep your private key safe and never share it with anyone!`
  );
});

bot.onText(/\/importwallet (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const privateKey = match![1];

  try {
    account = privateKeyToAccount(privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http("https://network.ambrosus-test.io"),
    }).extend(publicActions);

    walletClients[chatId] = client;

    bot.sendMessage(chatId, `Wallet imported!\nAddress: ${account.address}`);
  } catch (error) {
    bot.sendMessage(chatId, "Invalid private key. Please try again.");
  }
});

bot.onText(/\/createtoken/, async (msg) => {
  const chatId = msg.chat.id;
  if (!walletClients[chatId]) {
    bot.sendMessage(chatId, "Please create or import a wallet first.");
    return;
  }

  // Check user's balance
  const balance = await walletClients[chatId].getBalance({
    address: account.address,
  });
  const minimumBalance = parseEther("0.01"); // Adjust this value as needed

  if (balance < minimumBalance) {
    bot.sendMessage(
      chatId,
      `Insufficient balance. You need at least 0.01 ETH to deploy the contract.`
    );
    return;
  }

  bot.sendMessage(chatId, `Balance: ${formatEther(balance)} $AMB`);

  bot.sendMessage(chatId, "Please enter the token name:");
  bot.once("message", (nameMsg) => {
    const name = nameMsg.text!;
    bot.sendMessage(chatId, "Please enter the token symbol:");
    bot.once("message", (symbolMsg) => {
      const symbol = symbolMsg.text!;
      bot.sendMessage(chatId, "Please enter the total supply:");
      bot.once("message", async (supplyMsg) => {
        const supply = parseEther(supplyMsg.text!);
        try {
          const hash = await walletClients[chatId].deployContract({
            abi: AirDaoTokenAbi,
            bytecode: ADTBytecode, // This will be replaced by the bytecode of the deployed contract
            args: [name, symbol, supply],
          });
          bot.sendMessage(
            chatId,
            `Token creation transaction sent! Transaction hash: ${hash}\n\nPlease wait for the transaction to be mined.`
          );
        } catch (error) {
          bot.sendMessage(chatId, `Error creating token: ${error}`);
        }
      });
    });
  });
});

console.log("Bot is running...");
