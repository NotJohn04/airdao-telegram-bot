import TelegramBot from "node-telegram-bot-api";
import { Account, Chain, createWalletClient, formatEther, http, parseEther, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import AirDaoTokenAbi from "./abi/AirDaoToken.json";
import { ADTBytecode } from "./constants/AirDaoTokenByteCode";
import dotenv from "dotenv";
import axios from "axios";
import { airDaoMainnet, airDaoTestnet } from "./constants/AirDaoChain";
import {mainnet, rootstock, gnosis} from "viem/chains";

dotenv.config();

const token = process.env.BOTFATHER_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const walletClients: { [key: number]: any } = {};

const availableChains: { [key: string]: Chain } = {
  mainnet,
  rootstock,
  gnosis,
  airDaoMainnet,
  airDaoTestnet
};

// Utility Functions
const getWalletDetails = async (chatId: number) => {
  if (walletClients[chatId]) {
    const address = walletClients[chatId].account.address;
    const balance = await walletClients[chatId].getBalance({ address });
    return `Connected to wallet:\nAddress: ${address}\nBalance: ${formatEther(balance)} $AMB`;
  } else {
    return "Wallet not connected. Please create or import a wallet.";
  }
};

// Keyboards
const getStartKeyboard = (chatId: number) => {
  const isConnected = !!walletClients[chatId];
  return [
    [{ text: "Wallet Functionalities", callback_data: "wallet_functionalities" }, { text: "Analytics", callback_data: "analytics" }],
    ...(isConnected ? [[{ text: "Disconnect Wallet", callback_data: "disconnect_wallet" }]] : [])
  ];
};

const walletFunctionalitiesKeyboard = () => [
  [{ text: "Create Token", callback_data: "create_token" }, { text: "Create Wallet", callback_data: "create_wallet" }],
  [{ text: "Import Wallet", callback_data: "import_wallet" }, { text: "Back", callback_data: "back_to_main" }, { text: "Disconnect Wallet", callback_data: "disconnect_wallet" }]
];

const analyticsKeyboard = () => [
  [{ text: "Create Token", callback_data: "create_token" }, { text: "Get Token Info", callback_data: "token_info" }],
  [{ text: "Whale Alerts", callback_data: "whale_alerts" }, { text: "Back", callback_data: "back_to_main" }, { text: "Disconnect Wallet", callback_data: "disconnect_wallet" }]
];

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = await getWalletDetails(chatId);
  const keyboard = getStartKeyboard(chatId);
  
  bot.sendMessage(chatId, `Welcome! ${welcomeMessage}`, {
    reply_markup: { inline_keyboard: keyboard }
  });
});

// Callback query handler
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message!.chat.id;
  const data = callbackQuery.data;
  
  if (data === "wallet_functionalities") {
    bot.sendMessage(chatId, `\nWallet Functionalities:`, { reply_markup: { inline_keyboard: walletFunctionalitiesKeyboard() } });
  } else if (data === "analytics") {
    bot.sendMessage(chatId, `\nAnalytics:`, { reply_markup: { inline_keyboard: analyticsKeyboard() } });
  } else if (data === "disconnect_wallet") {
    delete walletClients[chatId];
    bot.sendMessage(chatId, "You have been disconnected from your wallet.");
    bot.sendMessage(chatId, "Welcome! Choose an option:", { reply_markup: { inline_keyboard: getStartKeyboard(chatId) } });
  } else if (data === "back_to_main") {
    const welcomeMessage = await getWalletDetails(chatId);
    bot.sendMessage(chatId, `Welcome! ${welcomeMessage}`, { reply_markup: { inline_keyboard: getStartKeyboard(chatId) } });
  } else if (data === "create_wallet") {
    handleCreateWallet(chatId);
  } else if (data === "import_wallet") {
    bot.sendMessage(chatId, "Please enter your private key using the command: /importwallet <private_key>");
  } else if (data === "create_token") {
    handleCreateToken(chatId);
  } else if (data === "token_info") {
    bot.sendMessage(chatId, "Please enter the token name using the command: /tokeninfo <token_name>");
  } else if (data === "whale_alerts") {
    handleWhaleReport(chatId);
  } else if (data?.startsWith("select_chain:")) {
    const chainName = data.split(":")[1];
    const selectedChain = availableChains[chainName];
    
    if (selectedChain) {
      walletClients[chatId] = createWalletClient({
        account: walletClients[chatId].account,
        chain: selectedChain,
        transport: http()
      }).extend(publicActions);

      bot.sendMessage(chatId, `Chain switched to ${chainName}. Enter token name:`);
      bot.once("message", (nameMsg) => {
        const name = nameMsg.text!;
        bot.sendMessage(chatId, "Enter token symbol:");
        bot.once("message", (symbolMsg) => {
          const symbol = symbolMsg.text!;
          bot.sendMessage(chatId, "Enter total supply:");
          bot.once("message", async (supplyMsg) => {
            const supply = parseEther(supplyMsg.text!);
            const confirmMessage = `Review token details:\nName: ${name}\nSymbol: ${symbol}\nTotal Supply: ${formatEther(supply)}\nChain: ${chainName}\nType 'confirm' to proceed or 'cancel' to abort.`;
            bot.sendMessage(chatId, confirmMessage);

            bot.once("message", async (confirmMsg) => {
              if (confirmMsg.text?.toLowerCase() === "confirm") {
                try {
                  const hash = await walletClients[chatId].deployContract({
                    account: walletClients[chatId].account,
                    abi: AirDaoTokenAbi,
                    bytecode: ADTBytecode,
                    args: [name, symbol, supply],
                  });
                  bot.sendMessage(chatId, `Token creation transaction sent on ${chainName}! Transaction hash: ${hash}`);
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
    } else {
      bot.sendMessage(chatId, "Invalid chain selected. Please try again.");
    }
  }
});

// Wallet and Token Handling Functions
const handleCreateWallet = async (chatId: number) => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    transport: http("https://rpc.airdao.io", { timeout: 100000 }),
    chain: airDaoMainnet,
  }).extend(publicActions);

  walletClients[chatId] = client;

  bot.sendMessage(chatId, `Wallet created!\nAddress: ${account.address}\nPrivate Key: ${privateKey}\nKeep your private key safe!`);
};

const handleImportWallet = async (chatId: number, privateKey: string) => {
  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http("https://rpc.airdao.io", { timeout: 100000 }),
      chain: airDaoMainnet,
    }).extend(publicActions);

    walletClients[chatId] = client;
    const balance = await client.getBalance({ address: account.address });
    bot.sendMessage(chatId, `Wallet imported!\nAddress: ${account.address}\nBalance: ${formatEther(balance)} $AMB`);
  } catch (error) {
    bot.sendMessage(chatId, "Invalid private key. Please try again.");
  }
};

const handleCreateToken = async (chatId: number) => {
  if (!walletClients[chatId]) {
    bot.sendMessage(chatId, "Please create or import a wallet first.");
    return;
  }

  const balance = await walletClients[chatId].getBalance({ address: walletClients[chatId].account.address });
  if (balance < parseEther("0.01")) {
    bot.sendMessage(chatId, "Insufficient balance. You need at least 0.01 ETH to deploy the contract.");
    return;
  }

  bot.sendMessage(chatId, "Select a chain to deploy the token:", {
    reply_markup: {
      inline_keyboard: Object.keys(availableChains).map(chainName => [
        { text: chainName, callback_data: `select_chain:${chainName}` }
      ])
    }
  });
};

// Token Info and Whale Alerts
const handleTokenInfo = async (chatId: number, tokenName: string) => {
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${tokenName}`);
    const tokenData = response.data;
    const price = tokenData.market_data.current_price.usd;
    const marketCap = tokenData.market_data.market_cap.usd;
    const change24h = tokenData.market_data.price_change_percentage_24h;

    bot.sendMessage(chatId, `<b>${tokenName} Token Info</b>\nPrice: $${price}\nMarket Cap: $${marketCap}\n24H Change: ${change24h}%`, { parse_mode: "HTML" });
  } catch (error) {
    bot.sendMessage(chatId, "Sorry, I couldn't fetch token information. Please try again later.");
  }
};

const handleWhaleReport = async (chatId: number) => {
  const whaleApiKey = process.env.WHALE_ALERT_API_KEY;
  try {
    const response = await axios.get(`https://api.whale-alert.io/v1/transactions`, {
      params: {
        api_key: whaleApiKey,
        min_value: 10000000,
        start: Math.floor(Date.now() / 1000) - 3600,
      },
    });

    const transactions = response.data.transactions;
    if (transactions.length > 0) {
      transactions.forEach((transaction: any) => {
        const { blockchain, symbol, amount_usd, from, to, hash } = transaction;
        bot.sendMessage(chatId, `<b>Whale Alert</b>\nBlockchain: ${blockchain}\nToken: ${symbol}\nAmount: $${amount_usd}\nFrom: ${from.owner || "Unknown"}\nTo: ${to.owner || "Unknown"}\nTx Hash: ${hash}`, { parse_mode: "HTML" });
      });
    } else {
      bot.sendMessage(chatId, "No recent whale transactions found.");
    }
  } catch (error) {
    bot.sendMessage(chatId, "Sorry, couldn't fetch whale transaction data. Try again later.");
  }
};

// /importwallet command
bot.onText(/\/importwallet (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const privateKey = match![1];
  handleImportWallet(chatId, privateKey);
});

// /createwallet command
bot.onText(/\/createwallet/, async (msg) => {
  const chatId = msg.chat.id;
  handleCreateWallet(chatId);
});

// /tokeninfo command
bot.onText(/\/tokeninfo (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenName = match![1];
  handleTokenInfo(chatId, tokenName);
});

// /whalealerts command
bot.onText(/\/whalealerts/, async (msg) => {
  const chatId = msg.chat.id;
  handleWhaleReport(chatId);
});

console.log("Bot is running...");
