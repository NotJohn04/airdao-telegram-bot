import TelegramBot from "node-telegram-bot-api";
import { Account, Chain, createWalletClient, formatEther, http, parseEther, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import AirDaoTokenAbi from "./abi/AirDaoToken.json";
import { ADTBytecode } from "./constants/AirDaoTokenByteCode";
import dotenv from "dotenv";
import axios from "axios";
import { airDaoMainnet, airDaoTestnet } from "./constants/AirDaoChain";
import { rootstock, gnosis, mainnet} from "viem/chains";

const chains = {
  rootstock,
  gnosis,
  mainnet
};

dotenv.config();

const token = process.env.BOTFATHER_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const walletClients: { [key: number]: any } = {};

const availableChains: { [key: string]: Chain } = {
  ...chains,
  airDaoMainnet,
  airDaoTestnet
};

// Utility Functions
const getWalletDetails = async (chatId: number) => {
  if (walletClients[chatId]) {
    const address = walletClients[chatId].account.address;
    const balance = await walletClients[chatId].getBalance({ address });
    const chainName = walletClients[chatId].chain.name;
    const nativeCurrency = walletClients[chatId].chain.nativeCurrency.symbol;
    return `Connected to wallet:
Address: ${address}
Network: ${chainName}
Balance: ${formatEther(balance)} ${nativeCurrency}`;
  } else {
    return "Wallet not connected. Please create or import a wallet.";
  }
};

// Keyboards
const getStartKeyboard = (chatId: number) => {
  const isConnected = !!walletClients[chatId];
  return [
    [{ text: "Wallet", callback_data: "wallet_menu" }],
    ...(isConnected ? [
      [{ text: "Tokens", callback_data: "tokens_menu" }],
      [{ text: "Network Settings", callback_data: "network_settings" }],
      [{ text: "Analytics", callback_data: "analytics" }]
    ] : [])
  ];
};

const getWalletKeyboard = (isConnected: boolean) => {
  if (isConnected) {
    return [
      [{ text: "Change Wallet", callback_data: "change_wallet" }],
      [{ text: "Disconnect Wallet", callback_data: "disconnect_wallet" }],
      [{ text: "Back", callback_data: "back_to_main" }]
    ];
  } else {
    return [
      [{ text: "Create Wallet", callback_data: "create_wallet" }],
      [{ text: "Import Wallet", callback_data: "import_wallet" }],
      [{ text: "Back", callback_data: "back_to_main" }]
    ];
  }
};

const getTokensKeyboard = () => [
  [{ text: "Create Token", callback_data: "create_token" }],
  [{ text: "My Tokens", callback_data: "my_tokens" }],
  [{ text: "Back", callback_data: "back_to_main" }]
];

const getImportWalletKeyboard = () => [
  [{ text: "Back", callback_data: "wallet_menu" }]
];

const getBackToMainKeyboard = () => [
  [{ text: "Back to Main Menu", callback_data: "back_to_main" }]
];

const getNetworkSettingsKeyboard = () => [
  [{ text: "Switch Network", callback_data: "switch_network" }],
  [{ text: "Back", callback_data: "back_to_main" }]
];

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = await getWalletDetails(chatId);
  const keyboard = getStartKeyboard(chatId);
  
  bot.sendMessage(chatId, `Welcome!\n\n${welcomeMessage}`, {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: "Markdown"
  });
});

// Callback query handler
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message!.chat.id;
  const messageId = callbackQuery.message!.message_id;
  const data = callbackQuery.data;
  
  if (data === "wallet_menu") {
    const isConnected = !!walletClients[chatId];
    bot.sendMessage(chatId, "Wallet Options:", {
      reply_markup: { inline_keyboard: getWalletKeyboard(isConnected) }
    });
  } else if (data === "tokens_menu") {
    bot.sendMessage(chatId, "Token Options:", {
      reply_markup: { inline_keyboard: getTokensKeyboard() }
    });
  } else if (data === "change_wallet") {
    bot.sendMessage(chatId, "Select an option:", {
      reply_markup: { inline_keyboard: getWalletKeyboard(false) }
    });
  } else if (data === "my_tokens") {
    handleMyTokens(chatId);
  } else if (data === "create_wallet") {
    await handleCreateWallet(chatId);
  } else if (data === "import_wallet") {
    bot.sendMessage(chatId, "Please enter your private key:", {
      reply_markup: { inline_keyboard: getImportWalletKeyboard() }
    });
    bot.once("message", async (msg) => {
      if (msg.text === undefined) {
        bot.sendMessage(chatId, "Invalid input. Please try again.");
        return;
      }
      const privateKey = msg.text;
      try {
        await handleImportWallet(chatId, privateKey);
        bot.sendMessage(chatId, "Welcome! Choose an option:", { 
          reply_markup: { inline_keyboard: getStartKeyboard(chatId) } 
        });
      } catch (error) {
        bot.sendMessage(chatId, "Failed to import wallet. Please try again.");
      }
    });
  } else if (data === "disconnect_wallet") {
    delete walletClients[chatId];
    bot.sendMessage(chatId, "You have been disconnected from your wallet.");
    bot.sendMessage(chatId, "Welcome! Choose an option:", { reply_markup: { inline_keyboard: getStartKeyboard(chatId) } });
  } else if (data === "back_to_main") {
    const welcomeMessage = await getWalletDetails(chatId);
    bot.sendMessage(chatId, `Welcome!\n\n${welcomeMessage}`, {
      reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
      parse_mode: "Markdown"
    });
  } else if (data === "create_token") {
    handleCreateToken(chatId);
  } else if (data === "token_info") {
    bot.sendMessage(chatId, "Please enter the token name using the command: /tokeninfo <token_name>");
  } else if (data === "whale_alerts") {
    handleWhaleReport(chatId);
  } else if (data === "network_settings") {
    const currentNetwork = walletClients[chatId]?.chain.name || "Not connected";
    bot.sendMessage(chatId, `Current Network: ${currentNetwork}\n\nChoose an option:`, {
      reply_markup: { inline_keyboard: getNetworkSettingsKeyboard() }
    });
  } else if (data === "switch_network") {
    bot.editMessageText("Select a network to switch to:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: Object.keys(availableChains).map(chainName => [
          { text: chainName, callback_data: `switch_to_chain:${chainName}` }
        ])
      }
    });
  } else if (data?.startsWith("switch_to_chain:")) {
    const chainName = data.split(":")[1];
    const selectedChain = availableChains[chainName];
    
    if (selectedChain && walletClients[chatId]) {
      walletClients[chatId] = createWalletClient({
        account: walletClients[chatId].account,
        chain: selectedChain,
        transport: http()
      }).extend(publicActions);

      // Delete the network selection message
      bot.deleteMessage(chatId, messageId);

      // Send a new welcome message with updated details
      const welcomeMessage = await getWalletDetails(chatId);
      bot.sendMessage(chatId, `Network switched to ${chainName}.\n\n${welcomeMessage}`, {
        reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
        parse_mode: "Markdown"
      });
    } else {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Invalid chain selected or wallet not connected. Please try again.",
        show_alert: true
      });
    }
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
            bot.sendMessage(chatId, confirmMessage, {
              reply_markup: { inline_keyboard: getBackToMainKeyboard() }
            });

            bot.once("message", async (confirmMsg) => {
              if (confirmMsg.text?.toLowerCase() === "confirm") {
                try {
                  const hash = await walletClients[chatId].deployContract({
                    account: walletClients[chatId].account,
                    abi: AirDaoTokenAbi,
                    bytecode: ADTBytecode,
                    args: [name, symbol, supply],
                  });
                  bot.sendMessage(chatId, `Token creation transaction sent on ${chainName}! Transaction hash: ${hash}`, {
                    reply_markup: { inline_keyboard: getBackToMainKeyboard() }
                  });
                } catch (error) {
                  bot.sendMessage(chatId, `Error creating token: ${error}`, {
                    reply_markup: { inline_keyboard: getBackToMainKeyboard() }
                  });
                }
              } else {
                bot.sendMessage(chatId, "Token creation cancelled.", {
                  reply_markup: { inline_keyboard: getBackToMainKeyboard() }
                });
              }
            });
          });
        });
      });
    } else {
      bot.sendMessage(chatId, "Invalid chain selected. Please try again.", {
        reply_markup: { inline_keyboard: getBackToMainKeyboard() }
      });
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

  bot.sendMessage(chatId, `Wallet created!\nAddress: ${account.address}\nPrivate Key: ${privateKey}\nKeep your private key safe!`, {
    reply_markup: { inline_keyboard: getBackToMainKeyboard() }
  });
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
    bot.sendMessage(chatId, `Wallet imported!\nAddress: ${account.address}\nBalance: ${formatEther(balance)} $AMB`, {
      reply_markup: { inline_keyboard: getBackToMainKeyboard() }
    });
  } catch (error) {
    throw new Error("Invalid private key. Please try again.");
  }
};

const handleCreateToken = async (chatId: number) => {
  if (!walletClients[chatId]) {
    bot.sendMessage(chatId, "Please create or import a wallet first.", {
      reply_markup: { inline_keyboard: getBackToMainKeyboard() }
    });
    return;
  }

  const balance = await walletClients[chatId].getBalance({ address: walletClients[chatId].account.address });
  if (balance < parseEther("0.01")) {
    bot.sendMessage(chatId, "Insufficient balance. You need at least 0.01 ETH to deploy the contract.", {
      reply_markup: { inline_keyboard: getBackToMainKeyboard() }
    });
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

// New function to handle "My Tokens" button
const handleMyTokens = async (chatId: number) => {
  if (!walletClients[chatId]) {
    bot.sendMessage(chatId, "Please connect a wallet first.");
    return;
  }

  // This is a placeholder. You'll need to implement the logic to fetch token balances.
  bot.sendMessage(chatId, "Fetching your token balances...");
  // TODO: Implement token balance fetching logic
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
