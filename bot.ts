import TelegramBot from "node-telegram-bot-api";
import { Account, createWalletClient, formatEther, http, parseEther, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import AirDaoTokenAbi from "./abi/AirDaoToken.json";
import { ADTBytecode } from "./constants/AirDaoTokenByteCode";
import dotenv from "dotenv";
import axios from "axios"; // Added to enable API calls for token info and whale alerts
import { airDaoTestnet } from "./constants/AirDaoChain";

dotenv.config();

const token = process.env.BOTFATHER_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const walletClients: { [key: number]: any } = {};

// Start command with buttons for options
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Welcome! Choose an option:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Create Wallet", callback_data: "create_wallet" },
          { text: "Import Wallet", callback_data: "import_wallet" }
        ],
        [
          { text: "Create Token", callback_data: "create_token" }
        ],
        [
          { text: "Get Token Info", callback_data: "token_info" },
          { text: "Whale Alerts", callback_data: "whale_alerts" }
        ]
      ]
    }
  });
});

// Callback query handler for menu buttons
bot.on("callback_query", (callbackQuery) => {
  const chatId = callbackQuery.message!.chat.id;
  const data = callbackQuery.data;

  if (data === "create_wallet") {
    handleCreateWallet(chatId);
  } else if (data === "import_wallet") {
    bot.sendMessage(chatId, "Please enter your private key using the command: /importwallet <private_key>");
  } else if (data === "create_token") {
    handleCreateToken(chatId);
  } else if (data === "token_info") {
    bot.sendMessage(chatId, "Please enter the token name using the command: /tokeninfo <token_name>");
  } else if (data === "whale_alerts") {
    handleWhaleReport(chatId);
  }
});

let account: Account;

// Function for handling wallet creation
const handleCreateWallet = async (chatId: number) => {
  const privateKey = generatePrivateKey();
  account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    transport: http('https://rpc.airdao.io', {
      timeout: 100000,
    }),
    chain: airDaoMainnet
    transport: http(),
    chain: airDaoTestnet,
  }).extend(publicActions);

  walletClients[chatId] = client;

  bot.sendMessage(
    chatId,
    `Wallet created!\nAddress: ${account.address}\nPrivate Key: ${privateKey}\n\nKeep your private key safe and never share it with anyone!`
  );
};

// Wallet import using /importwallet <private_key> command
bot.onText(/\/importwallet (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const privateKey = match![1];

  try {
    account = privateKeyToAccount(privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http("https://rpc.airdao.io", {
        timeout: 100000,
      }),
      transport: http("https://network.ambrosus-test.io"),
    }).extend(publicActions);

    walletClients[chatId] = client;

    bot.sendMessage(chatId, `Wallet imported!\nAddress: ${account.address}`);
  } catch (error) {
    bot.sendMessage(chatId, "Invalid private key. Please try again.");
  }
});

// Function for handling token creation
const handleCreateToken = async (chatId: number) => {
  if (!walletClients[chatId]) {
    bot.sendMessage(chatId, "Please create or import a wallet first.");
    return;
  }

  const balance = await walletClients[chatId].getBalance({ address: account.address });
  const minimumBalance = parseEther("0.01");

  if (balance < minimumBalance) {
    bot.sendMessage(chatId, `Insufficient balance. You need at least 0.01 ETH to deploy the contract.`);
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

        const confirmMessage = `Please review your token details:\nName: ${name}\nSymbol: ${symbol}\nTotal Supply: ${formatEther(supply)} ${symbol}\n\nType 'confirm' to deploy the contract or 'cancel' to abort.`;
        bot.sendMessage(chatId, confirmMessage);

        bot.once("message", async (confirmMsg) => {
          if (confirmMsg.text?.toLowerCase() === "confirm") {
            try {
              const hash = await walletClients[chatId].deployContract({
                account,
                abi: AirDaoTokenAbi,
                bytecode: ADTBytecode,
                args: [name, symbol, supply],
                chain: airDaoTestnet,
              });
              bot.sendMessage(chatId, `Token creation transaction sent! Transaction hash: ${hash}\n\nPlease wait for the transaction to be mined.`);
            } catch (error) {
              bot.sendMessage(chatId, `Error creating token: ${error}`);
            }
          } else {
            bot.sendMessage(chatId, "Token creation cancelled.");
          }
        });
      });
    });
  });
};

// Get real-time token information
bot.onText(/\/tokeninfo (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenName = match![1];

  if (!tokenName) {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/amber`);
    const tokenData = response.data;
    const price = tokenData.market_data.current_price.usd;
    const marketCap = tokenData.market_data.market_cap.usd;
    const change24h = tokenData.market_data.price_change_percentage_24h;

    const message = `
      <b>AMB Token Info</b>
      ---------------------------
      Price: $${price}
      Market Cap: $${marketCap}
      24H Change: ${change24h}%
    `;
    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    
  }
  else {

  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${tokenName}`);
    const tokenData = response.data;
    const price = tokenData.market_data.current_price.usd;
    const marketCap = tokenData.market_data.market_cap.usd;
    const change24h = tokenData.market_data.price_change_percentage_24h;

    const message = `
      <b>${tokenName} Token Info</b>
      ---------------------------
      Price: $${price}
      Market Cap: $${marketCap}
      24H Change: ${change24h}%
    `;
    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    bot.sendMessage(chatId, "Sorry, I couldn't fetch token information. Please try again later.");
  }
}
});

// Whale transaction alerts
const handleWhaleReport = async (chatId: number) => {
  const whaleApiKey = process.env.WHALE_ALERT_API_KEY;

  try {
    const response = await axios.get(`https://api.whale-alert.io/v1/transactions`, {
      params: {
        api_key: whaleApiKey,
        min_value: 10000000, // Minimum $1M transaction value
        start: Math.floor(Date.now() / 1000) - 3600, // Last hour
      },
    });

    const transactions = response.data.transactions;
    if (transactions.length > 0) {
      transactions.forEach((transaction: any) => {
        const { blockchain, symbol, amount_usd, from, to, hash } = transaction;
        const message = `
          <b>Whale Alert</b>
          Blockchain: ${blockchain}
          Token: ${symbol}
          Amount: $${amount_usd} USD
          From: ${from.owner || "Unknown"}
          To: ${to.owner || "Unknown"}
          Tx Hash: ${hash}
        `;
        bot.sendMessage(chatId, message, { parse_mode: "HTML" });
      });
    } else {
      bot.sendMessage(chatId, "No recent whale transactions found.");
    }
  } catch (error) {
    bot.sendMessage(chatId, "Sorry, couldn't fetch whale transaction data. Try again later.");
  }
};

console.log("Bot is running...");
