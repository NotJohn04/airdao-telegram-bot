import TelegramBot from "node-telegram-bot-api";
import {
  Account,
  Chain,
  createWalletClient,
  erc20Abi,
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
import { handleSendMoney } from './utils/sendMoney';
import { normalize } from 'viem/ens'
import { formatDistanceToNow } from 'date-fns'
import { fetchExpiringEnsNames } from './utils/fetchEns';

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
  console.log("Getting wallet details for chatId:", chatId);
  if (walletClients[chatId]) {
    const address = walletClients[chatId].account.address;
    const balance = await walletClients[chatId].getBalance({ address });
    const chainName = walletClients[chatId].chain.name;
    const nativeCurrency = walletClients[chatId].chain.nativeCurrency.symbol;
    return `💼 Connected: ${address}\n🌐 Network: ${chainName}\n💰 Balance: ${formatEther(balance)} ${nativeCurrency}`;
  } else {
    return "❌ Wallet not connected. Please create or import a wallet.";
  }
};

// Keyboards
const getStartKeyboard = (chatId: number) => {
  console.log("Generating start keyboard for chatId:", chatId);
  const isConnected = !!walletClients[chatId];
  return [
    [{ text: "💼 Wallet", callback_data: "wallet_menu" }],
    ...(isConnected
      ? [
          [{ text: "🪙 Tokens", callback_data: "tokens_menu" }],
          [{ text: "🌐 Network Settings", callback_data: "network_settings" }],
          [{ text: "📊 Analytics", callback_data: "analytics" }],
          [{ text: "🏷️ ENS", callback_data: "ens_menu" }], // New ENS option
        ]
      : []),
  ];
};

const getWalletKeyboard = (isConnected: boolean) => {
  if (isConnected) {
    return [
      [{ text: "💸 Send Money", callback_data: "send_money" }],
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
  [{ text: "💸 Transfer Token", callback_data: "transfer_token" }], // New option
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
  console.log("Received callback query:", callbackQuery.data);
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
      // Create a new wallet client with the selected chain
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
    console.log("Back to main menu triggered");
    try {
      const welcomeMessage = await getWalletDetails(chatId);
      console.log("Welcome message generated:", welcomeMessage);
      
      const keyboard = getStartKeyboard(chatId);
      console.log("Start keyboard generated:", JSON.stringify(keyboard));

      await bot.editMessageText(`👋 Welcome!\n\n${welcomeMessage}`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: "Markdown",
      });
      console.log("Message edited successfully");
    } catch (error) {
      console.error("Error in back_to_main handler:", error);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "An error occurred. Please try again.",
        show_alert: true,
      });
    }
  } else if (data === "create_wallet") {
    await handleCreateWallet(chatId, messageId);
  } else if (data === "import_wallet") {
    handleImportWallet(chatId, messageId);
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
    const [_, chainName, tokenName, symbol, totalSupply] = data.split(":");
    const selectedChain = availableChains[chainName];
    
    if (!selectedChain) {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "❌ Invalid chain selected. Please try again.",
        show_alert: true,
      });
      return;
    }

    try {
      // Deploy token logic here
      const deployTransaction: Hash = await walletClients[chatId].deployContract({
        abi: AirDaoTokenAbi,
        bytecode: ADTBytecode,
        chain: selectedChain,
        args: [tokenName, symbol, BigInt(totalSupply)], // Pass the arguments to the constructor
      });

      const receipt = await walletClients[chatId].waitForTransactionReceipt({ hash: deployTransaction });
      const tokenAddress = receipt.contractAddress;

      bot.editMessageText(
        `✅ Token deployed successfully!\n\n📍 Address: \`${tokenAddress}\`\n🔗 [View on Explorer](${selectedChain.blockExplorers?.default.url}/address/${tokenAddress})`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: getBackToMainKeyboard() },
        }
      );
    } catch (error) {
      console.error("Error deploying token:", error);
      bot.editMessageText(
        "❌ An error occurred while deploying the token. Please try again.",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: getBackToMainKeyboard() },
        }
      );
    }
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
  } else if (data === "send_money") {
    handleSendMoney(chatId, messageId, bot, walletClients[chatId]);
  } else if (data === "transfer_token") {
    handleTransferToken(chatId, messageId);
  } else if (data === "ens_menu") {
    handleENSMenu(chatId, messageId);
  } else if (data === "ens_lookup") {
    handleENSLookup(chatId, messageId);
  } else if (data === "ens_register") {
    handleENSRegister(chatId, messageId);
  } else if (data.startsWith("register_ens:")) {
    const ensName = data.split(":")[1];
    handleENSRegister(chatId, messageId, ensName);
  } else if (data.startsWith("confirm_register_ens:")) {
    const ensName = data.split(":")[1];
    // Here you would implement the actual ENS registration logic
    bot.editMessageText(`🔄 Registration process initiated for ${ensName}. Please check your wallet for confirmation.`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
        ],
      },
    });
  } else if (data === "ens_watch" || data.startsWith("ens_watch:")) {
    const filter = data.split(":")[1] ? parseInt(data.split(":")[1]) : undefined;
    handleENSWatch(chatId, messageId, filter);
  } else if (data === 'watch_expiring_names') {
    await handleWatchExpiringNames(chatId, messageId);
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

const handleImportWallet = async (chatId: number, messageId: number) => {
  bot.editMessageText("Please enter your private key:", {
    chat_id: chatId,
    message_id: messageId,
  });

  bot.once("message", async (msg) => {
    if (msg.text) {
      try {
        const privateKey = msg.text as `0x${string}`;
        const account = privateKeyToAccount(privateKey);
        
        walletClients[chatId] = createWalletClient({
          account,
          chain: mainnet,
          transport: http(),
        }).extend(publicActions);

        // Delete the message containing the private key
        await bot.deleteMessage(chatId, msg.message_id);

        const welcomeMessage = await getWalletDetails(chatId);
        bot.sendMessage(chatId, `✅ Wallet imported successfully!\n\n${welcomeMessage}`, {
          reply_markup: { inline_keyboard: getStartKeyboard(chatId) },
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error("Error importing wallet:", error);
        bot.sendMessage(chatId, "❌ Invalid private key. Please try again.");
      }
    } else {
      bot.sendMessage(chatId, "❌ Invalid input. Please try again.");
    }
  });
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

  bot.editMessageText("Please enter the token details in the following format:\n\n<token_name> <symbol> <total_supply>\n\nFor example: MyToken MTK 1000000", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Back", callback_data: "tokens_menu" }],
      ],
    },
  });

  bot.once("message", async (msg) => {
    if (msg.text) {
      const [tokenName, symbol, totalSupply] = msg.text.split(" ");
      
      if (!tokenName || !symbol || !totalSupply) {
        bot.sendMessage(chatId, "❌ Invalid format. Please try again with the correct format.");
        return;
      }

      bot.sendMessage(chatId, "🌐 Select a chain to deploy the token:", {
        reply_markup: {
          inline_keyboard: Object.keys(availableChains).map((chainName) => [
            { text: chainName, callback_data: `deploy_token:${chainName}:${tokenName}:${symbol}:${totalSupply}` },
          ]),
        },
      });
    } else {
      bot.sendMessage(chatId, "❌ Invalid input. Please try again.");
    }
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
          `<b>🐳 Whale Alert</b>\n Blockchain: ${blockchain}\n🪙 Token: ${symbol}\n💵 Amount: $${amount_usd}\n📤 From: ${
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

// Add this new function to handle token transfers
const handleTransferToken = (chatId: number, messageId: number) => {
  bot.editMessageText("💸 Token Transfer\n\nPlease enter the transfer details in the following format:\n\n<token_address> <recipient_address> <amount>", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Back to Tokens Menu", callback_data: "tokens_menu" }]
      ]
    }
  });

  // Set up a listener for the next message
  bot.once("message", async (msg) => {
    if (msg.text) {
      const [tokenAddress, recipientAddress, amount] = msg.text.split(" ");
      
      if (!tokenAddress || !recipientAddress || !amount) {
        bot.sendMessage(chatId, "❌ Invalid format. Please try again with the correct format.");
        return;
      }

      const hash = await walletClients[chatId].writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress, amount],
      });

      bot.sendMessage(chatId, `✅ Transfer initiated:\nToken: ${tokenAddress}\nTo: ${recipientAddress}\nAmount: ${amount}\n\nPlease check your wallet for confirmation. 🔗 [View on Explorer](${walletClients[chatId].chain.blockExplorers.default.url}/tx/${hash})`);
    } else {
      bot.sendMessage(chatId, "❌ Invalid input. Please try again.");
    }
  });
};

const handleENSMenu = async (chatId: number, messageId: number) => {
  if (!walletClients[chatId]) {
    bot.editMessageText("❌ Please connect a wallet first.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getBackToMainKeyboard() },
    });
    return;
  }

  if (walletClients[chatId].chain.id !== mainnet.id) {
    bot.editMessageText("⚠️ Please switch to Ethereum mainnet to use ENS features.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Switch to Mainnet", callback_data: "switch_to_chain:mainnet" }],
          [{ text: "🔙 Back", callback_data: "back_to_main" }],
        ],
      },
    });
    return;
  }

  bot.editMessageText("🏷️ ENS Menu", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Lookup ENS Name", callback_data: "ens_lookup" }],
        [{ text: "📝 Register ENS Name", callback_data: "ens_register" }],
        [{ text: "👀 Watch Expiring Names", callback_data: "ens_watch" }], // New button
        [{ text: "🔙 Back", callback_data: "back_to_main" }],
      ],
    },
  });
};

const handleENSLookup = (chatId: number, messageId: number) => {
  bot.editMessageText("🔍 Enter the ENS name or Ethereum address you want to look up:", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
      ],
    },
  });

  bot.once("message", async (msg) => {
    if (msg.text) {
      try {
        let result: string;
        let ensName: string | null = null;
        let address: `0x${string}` | null = null;
        let isAvailableForRegistration = false;

        if (msg.text.endsWith('.eth') || !msg.text.startsWith('0x')) {
          // Lookup address for ENS name
          ensName = normalize(msg.text);
          address = await walletClients[chatId].getEnsAddress({ name: ensName });
          if (address) {
            result = `✅ ENS Name: ${ensName}\n👤 Owner: ${address}`;
          } else {
            result = `❌ No address found for ${ensName}`;
            isAvailableForRegistration = true;
          }
        } else {
          // Lookup ENS name for address
          address = msg.text as `0x${string}`;
          ensName = await walletClients[chatId].getEnsName({ address });
          result = ensName ? `✅ Address: ${address}\n🏷️ ENS Name: ${ensName}` : `❌ No ENS name found for ${address}`;
        }

        // Check expiration if we have a registered ENS name
        if (ensName && !isAvailableForRegistration) {
          try {
            const expiryDate = await walletClients[chatId].getEnsExpiry({ name: ensName });
            if (expiryDate) {
              const timeToExpiry = formatDistanceToNow(expiryDate);
              const isCloseToExpiring = expiryDate.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000; // 30 days
              const expiryWarning = isCloseToExpiring ? "⚠️ " : "";
              result += `\n⏳ Expiry: ${expiryWarning}${timeToExpiry}`;
            }
          } catch (error) {
            console.error('Error fetching ENS expiry:', error);
          }
        }

        const inlineKeyboard = [
          [{ text: "🔍 Look up another", callback_data: "ens_lookup" }],
          [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
        ];

        if (isAvailableForRegistration) {
          inlineKeyboard.unshift([{ text: "📝 Register this name", callback_data: `register_ens:${ensName}` }]);
        }

        bot.sendMessage(chatId, result, {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
        });
      } catch (error) {
        console.error('Error in ENS lookup:', error);
        bot.sendMessage(chatId, "❌ An error occurred during the lookup. Please try again.", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔍 Try again", callback_data: "ens_lookup" }],
              [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
            ],
          },
        });
      }
    } else {
      bot.sendMessage(chatId, "❌ Invalid input. Please enter a valid ENS name or Ethereum address.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 Try again", callback_data: "ens_lookup" }],
            [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
          ],
        },
      });
    }
  });
};

const handleENSRegister = (chatId: number, messageId: number, ensName?: string) => {
  const message = ensName 
    ? `📝 You're about to register ${ensName}. Please confirm or enter a different name:`
    : "📝 Enter the ENS name you want to register:";

  bot.editMessageText(message, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        ...(ensName ? [[{ text: "✅ Confirm", callback_data: `confirm_register_ens:${ensName}` }]] : []),
        [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
      ],
    },
  });

  if (!ensName) {
    bot.once("message", async (msg) => {
      if (msg.text) {
        handleENSRegister(chatId, messageId, normalize(msg.text));
      } else {
        bot.sendMessage(chatId, "❌ Invalid input. Please enter a valid ENS name.");
      }
    });
  }
};

// Add this new function to handle the ENS Watch feature
const handleENSWatch = async (chatId: number, messageId: number, filter?: number) => {
  const filterOptions = [
    [
      { text: "3 Letters", callback_data: "ens_watch:3" },
      { text: "4 Letters", callback_data: "ens_watch:4" },
      { text: "5 Letters", callback_data: "ens_watch:5" },
      { text: "6 Letters", callback_data: "ens_watch:6" },
    ],
    [{ text: "All Names", callback_data: "ens_watch" }],
    [{ text: "🔙 Back to ENS Menu", callback_data: "ens_menu" }],
  ];

  try {
    const expiringNames = await fetchExpiringEnsNames(filter);
    let message = "👀 Expiring ENS Names:\n\n";
    expiringNames.forEach((name, index) => {
      message += `${index + 1}. ${name.name} - Expires in ${name.daysUntilExpiry} days\n`;
    });

    if (expiringNames.length === 0) {
      message = "No expiring names found with the current filter.";
    }

    bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: filterOptions },
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error('Error fetching expiring ENS names:', error);
    bot.editMessageText("❌ An error occurred while fetching expiring ENS names. Please try again.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: filterOptions },
    });
  }
};

const handleWatchExpiringNames = async (chatId: number, messageId: number) => {
  try {
    bot.editMessageText("Enter a name length to filter (or 'skip' to show all):", {
      chat_id: chatId,
      message_id: messageId,
    });
    const lengthMsg = await new Promise<{ text?: string }>(resolve => bot.once('message', resolve));
    const nameLength = lengthMsg.text?.toLowerCase() === 'skip' ? undefined : parseInt(lengthMsg.text || '');

    bot.editMessageText("Fetching expiring ENS names...", {
      chat_id: chatId,
      message_id: messageId,
    });

    const expiringNames = await fetchExpiringEnsNames(nameLength);

    if (expiringNames.length === 0) {
      bot.editMessageText("No expiring ENS names found matching the criteria.", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: getBackToMainKeyboard() },
      });
      return;
    }

    const messageText = expiringNames.map(({ name, daysUntilExpiry }) => 
      `${name}: expires in ${daysUntilExpiry} days`
    ).join('\n');

    bot.editMessageText(`Expiring ENS names${nameLength ? ` (length: ${nameLength})` : ''}:\n\n${messageText}`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getBackToMainKeyboard() },
    });
  } catch (error) {
    console.error("Error fetching expiring ENS names:", error);
    bot.editMessageText("An error occurred while fetching expiring ENS names. Please try again later.", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: getBackToMainKeyboard() },
    });
  }
};

// /importwallet command
bot.onText(/\/importwallet (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const privateKey = match![1];
  const sentMsg = await bot.sendMessage(chatId, "Importing wallet...");
  handleImportWallet(chatId, sentMsg.message_id);
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
