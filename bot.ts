import TelegramBot from "node-telegram-bot-api";
import {
  Account,
  Chain,
  createWalletClient,
  formatEther,
  Hash,
  http,
  parseEther,
  publicActions,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import AirDaoTokenAbi from "./abi/AirDaoToken.json";
import { ADTBytecode } from "./constants/AirDaoTokenByteCode";
import dotenv from "dotenv";
import axios from "axios";
import { airDaoMainnet, airDaoTestnet } from "./constants/AirDaoChain";
import { rootstock, gnosis, mainnet } from "viem/chains";

const chains = {
  rootstock,
  gnosis,
  mainnet,
};

dotenv.config();

const token = process.env.BOTFATHER_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const walletClients: { [key: number]: any } = {};

const availableChains: { [key: string]: Chain } = {
  ...chains,
  airDaoMainnet,
  airDaoTestnet,
};

// Utility Functions
const getWalletDetails = async (chatId: number) => {
  if (walletClients[chatId]) {
    const address = walletClients[chatId].account.address;
    const balance = await walletClients[chatId].getBalance({ address });
    const chainName = walletClients[chatId].chain.name;
    const nativeCurrency = walletClients[chatId].chain.nativeCurrency.symbol;
    return `💼 Connected: ${address}\`
🌐 Network: ${chainName}
💰 Balance: ${formatEther(balance)} ${nativeCurrency}`;
  } else {
    return "❌ Wallet not connected. Please create or import a wallet.";
  }
};

// Keyboards
const getStartKeyboard = (chatId: number) => {
  const isConnected = !!walletClients[chatId];
  return [
    [{ text: "💼 Wallet", callback_data: "wallet_menu" }],
    ...(isConnected
      ? [
          [{ text: "🪙 Tokens", callback_data: "tokens_menu" }],
          [{ text: "🌐 Network Settings", callback_data: "network_settings" }],
          [{ text: "📊 Analytics", callback_data: "analytics" }],
        ]
      : []),
  ];
};

const getWalletKeyboard = (isConnected: boolean) => {
  if (isConnected) {
    return [
      [{ text: "🔄 Change Wallet", callback_data: "change_wallet" }],
      [{ text: "🔌 Disconnect Wallet", callback_data: "disconnect_wallet" }],
      [{ text: "🔙 Back", callback_data: "back_to_main" }],
    ];
  } else {
    return [
      [{ text: "➕ Create Wallet", callback_data: "create_wallet" }],
      [{ text: "📥 Import Wallet", callback_data: "import_wallet" }],
      [{ text: "🔙 Back", callback_data: "back_to_main" }],
    ];
  }
};

const getTokensKeyboard = () => [
  [{ text: "➕ Create Token", callback_data: "create_token" }],
  [{ text: "🏦 My Tokens", callback_data: "my_tokens" }],
  [{ text: "🔙 Back", callback_data: "back_to_main" }],
];

const getImportWalletKeyboard = () => [
  [{ text: "🔙 Back", callback_data: "wallet_menu" }],
];

const getBackToMainKeyboard = () => [
  [{ text: "🏠 Back to Main Menu", callback_data: "back_to_main" }],
];

const getNetworkSettingsKeyboard = () => [
  [{ text: "🔄 Switch Network", callback_data: "switch_network" }],
  [{ text: "🔙 Back", callback_data: "back_to_main" }],
];

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = await getWalletDetails(chatId);
  const keyboard = getStartKeyboard(chatId);

  bot.sendMessage(chatId, `👋 Welcome!\n\n${welcomeMessage}`, {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: "Markdown",
  });
});

// Callback query handler
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message!.chat.id;
  const messageId = callbackQuery.message!.message_id;
  const data = callbackQuery.data;

  if (data === "wallet_menu") {
    const isConnected = !!walletClients[chatId];
    bot.editMessageText("💼 Wallet Options:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { 
        inline_keyboard: [
          ...getWalletKeyboard(isConnected),
          [{ text: "🔙 Back to Main Menu", callback_data: "back_to_main" }]
        ]
      },
    });
  } else if (data === "tokens_menu") {
    bot.editMessageText("🪙 Token Options:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getTokensKeyboard() },
    });
  } else if (data === "network_settings") {
    const currentNetwork = walletClients[chatId]?.chain.name || "Not connected";
    bot.editMessageText(
      `🌐 Current Network: ${currentNetwork}\n\nChoose an option:`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: getNetworkSettingsKeyboard() },
      }
    );
  } else if (data === "switch_network") {
    bot.editMessageText("🔄 Select a network to switch to:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: Object.keys(availableChains).map((chainName) => [
          { text: chainName, callback_data: `switch_to_chain:${chainName}` },
        ]),
      },
    });
  } else if (data?.startsWith("switch_to_chain:")) {
    const chainName = data.split(":")[1];
    const selectedChain = availableChains[chainName];

    if (selectedChain && walletClients[chatId]) {
      walletClients[chatId] = createWalletClient({
        account: walletClients[chatId].account,
        chain: selectedChain,
        transport: http(),
      }).extend(publicActions);

      const welcomeMessage = await getWalletDetails(chatId);
      bot.editMessageText(
        `✅ Network switched to ${chainName}.\n\n${welcomeMessage}`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
          parse_mode: "Markdown",
        }
      );
    } else {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Invalid chain selected or wallet not connected. Please try again.",
        show_alert: true,
      });
    }
  } else if (data === "back_to_main") {
    const welcomeMessage = await getWalletDetails(chatId);
    bot.editMessageText(`👋 Welcome!\n\n${welcomeMessage}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
      parse_mode: "Markdown",
    });
  } else if (data === "create_wallet") {
    await handleCreateWallet(chatId, messageId);
  } else if (data === "import_wallet") {
    bot.editMessageText("🔑 Please enter your private key:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getImportWalletKeyboard() },
    });
    bot.once("message", async (msg) => {
      if (msg.text === undefined) {
        bot.editMessageText("❌ Invalid input. Please try again.", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: getBackToMainKeyboard() },
        });
        return;
      }
      const privateKey = msg.text;
      await handleImportWallet(chatId, messageId, privateKey);
    });
  } else if (data === "disconnect_wallet") {
    delete walletClients[chatId];
    bot.editMessageText("🔌 You have been disconnected from your wallet.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
    });
  } else if (data === "create_token") {
    handleCreateToken(chatId, messageId);
  } else if (data === "my_tokens") {
    handleMyTokens(chatId, messageId);
  } else if (data === "token_info") {
    bot.editMessageText(
      "🔎 Please enter the token name using the command: /tokeninfo <token_name>",
      {
        chat_id: chatId,
        message_id: messageId,
      }
    );
  } else if (data === "whale_alerts") {
    handleWhaleReport(chatId, messageId);
  } else if (data?.startsWith("deploy_token:")) {
    const chainName = data.split(":")[1];
    const selectedChain = availableChains[chainName];
    
    // Deploy token logic here
    // Get the token address from the to address in the transaction
    const deployTransaction: Hash = await walletClients[chatId].deployContract({
      abi: AirDaoTokenAbi,
      bytecode: ADTBytecode,
      chain: selectedChain,
    });

    const receipt = await walletClients[chatId].getTransactionReceipt({
      hash: deployTransaction,
    });

    const tokenAddress = receipt?.to;

    const explorerUrl = selectedChain.blockExplorers?.default?.url || "";
    const tokenLink = `${explorerUrl}/address/${tokenAddress}`;

    bot.editMessageText(
      `✅ Token deployed successfully!\n\n📍 Address: \`${tokenAddress}\`\n🔗 [View on Explorer](${tokenLink})`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: getBackToMainKeyboard() },
      }
    );
  } else if (data === "change_wallet") {
    bot.editMessageText("Choose an option:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Create Wallet", callback_data: "create_wallet" }],
          [{ text: "📥 Import Wallet", callback_data: "import_wallet" }],
          [{ text: "🔙 Back", callback_data: "wallet_menu" }],
        ],
      },
    });
  } else if (data === "confirm_private_key") {
    bot.editMessageText("Wallet created successfully. What would you like to do next?", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
    });
  }
});

// Wallet and Token Handling Functions
const handleCreateWallet = async (chatId: number, messageId: number) => {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    transport: http("https://rpc.airdao.io", { timeout: 100000 }),
    chain: airDaoMainnet,
  }).extend(publicActions);

  walletClients[chatId] = client;

  bot.editMessageText(
    `✅ Wallet created!\n📍 Address: \`${account.address}\`\n🔑 Private Key: \`${privateKey}\`\n⚠️ Keep your private key safe!`,
    {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "I've saved my private key", callback_data: "confirm_private_key" }],
        ],
      },
    }
  );
};

const handleImportWallet = async (
  chatId: number,
  messageId: number,
  privateKey: string
) => {
  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const client = createWalletClient({
      account,
      transport: http("https://rpc.airdao.io", { timeout: 100000 }),
      chain: airDaoMainnet,
    }).extend(publicActions);

    walletClients[chatId] = client;
    const balance = await client.getBalance({ address: account.address });
    bot.editMessageText(
      `✅ Wallet imported!\n📍 Address: \`${
        account.address
      }\`\n💰 Balance: ${formatEther(balance)} $AMB`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: getBackToMainKeyboard() },
        parse_mode: "Markdown",
      }
    );
  } catch (error) {
    bot.editMessageText("❌ Invalid private key. Please try again.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getBackToMainKeyboard() },
    });
  }
};

const handleCreateToken = async (chatId: number, messageId: number) => {
  if (!walletClients[chatId]) {
    bot.editMessageText("❌ Please create or import a wallet first.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getBackToMainKeyboard() },
    });
    return;
  }

  const balance = await walletClients[chatId].getBalance({
    address: walletClients[chatId].account.address,
  });
  if (balance < parseEther("0.01")) {
    bot.editMessageText(
      "⚠️ Insufficient balance. You need at least 0.01 ETH to deploy the contract.",
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: getBackToMainKeyboard() },
      }
    );
    return;
  }

  bot.editMessageText("🌐 Select a chain to deploy the token:", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: Object.keys(availableChains).map((chainName) => [
        { text: chainName, callback_data: `deploy_token:${chainName}` },
      ]),
    },
  });
};

// Token Info and Whale Alerts
const handleTokenInfo = async (chatId: number, tokenName: string) => {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${tokenName}`
    );
    const tokenData = response.data;
    const price = tokenData.market_data.current_price.usd;
    const marketCap = tokenData.market_data.market_cap.usd;
    const change24h = tokenData.market_data.price_change_percentage_24h;

    bot.sendMessage(
      chatId,
      `<b>${tokenName} Token Info</b>\n💵 Price: $${price}\n📈 Market Cap: $${marketCap}\n📉 24H Change: ${change24h}%`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    bot.sendMessage(
      chatId,
      "❌ Sorry, I couldn't fetch token information. Please try again later."
    );
  }
};

const handleWhaleReport = async (chatId: number, messageId: number) => {
  const whaleApiKey = process.env.WHALE_ALERT_API_KEY;
  try {
    const response = await axios.get(
      `https://api.whale-alert.io/v1/transactions`,
      {
        params: {
          api_key: whaleApiKey,
          min_value: 10000000,
          start: Math.floor(Date.now() / 1000) - 3600,
        },
      }
    );

    const transactions = response.data.transactions;
    if (transactions.length > 0) {
      transactions.forEach((transaction: any) => {
        const { blockchain, symbol, amount_usd, from, to, hash } = transaction;
        bot.sendMessage(
          chatId,
          `<b>🐳 Whale Alert</b>\n🌐 Blockchain: ${blockchain}\n🪙 Token: ${symbol}\n💵 Amount: $${amount_usd}\n📤 From: ${
            from.owner || "Unknown"
          }\n📥 To: ${to.owner || "Unknown"}\n🔗 Tx Hash: ${hash}`,
          { parse_mode: "HTML" }
        );
      });
    } else {
      bot.sendMessage(chatId, "🐳 No recent whale transactions found.");
    }
  } catch (error) {
    bot.sendMessage(
      chatId,
      "❌ Sorry, couldn't fetch whale transaction data. Try again later."
    );
  }
};

// New function to handle "My Tokens" button
const handleMyTokens = async (chatId: number, messageId: number) => {
  if (!walletClients[chatId]) {
    bot.sendMessage(chatId, "🚫 Please connect a wallet first.");
    return;
  }

  // This is a placeholder. You'll need to implement the logic to fetch token balances.
  bot.sendMessage(chatId, "🔄 Fetching your token balances...");
  // TODO: Implement token balance fetching logic
};

// /importwallet command
bot.onText(/\/importwallet (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const privateKey = match![1];
  const sentMsg = await bot.sendMessage(chatId, "Importing wallet...");
  handleImportWallet(chatId, sentMsg.message_id, privateKey);
});

// /createwallet command
bot.onText(/\/createwallet/, async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  handleCreateWallet(chatId, messageId);
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
  const messageId = msg.message_id;
  handleWhaleReport(chatId, messageId);
});

console.log("🤖 Bot is running...");
