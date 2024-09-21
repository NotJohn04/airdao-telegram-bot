import TelegramBot from 'node-telegram-bot-api';
import axios, { AxiosResponse } from 'axios';

const token = '7827805708:AAEKBqIE56ggcH3TVZGCe_O5ZBvXVV_V5_E'; // Replace with your bot token
const bot = new TelegramBot(token, { polling: true });

const availableNetworks: string[] = ['ethereum', 'binance-smart-chain', 'polygon', 'avalanche', 'fantom'];

const chatIdForUpdates: number = 5939209582;

interface TokenData {
  attributes: {
    name: string;
    symbol: string;
    price_usd: number;
    market_cap_usd: number;
    volume_usd: number;
    total_supply: number;
  };
  market_data: {
    price_change_percentage_1h_in_currency: { usd: number };
    price_change_percentage_24h_in_currency: { usd: number };
    price_change_percentage_7d_in_currency: { usd: number };
  };
}

const generateTokenInfo = async (chatId: number, network: string, tokenAddress: string): Promise<void> => {
  try {
    const geckoTerminalResponse: AxiosResponse<{ data: TokenData }> = await axios.get(
      `https://api.geckoterminal.com/api/v2/simple/networks/${network}/tokens/${tokenAddress}`
    );

    const tokenData = geckoTerminalResponse.data.data;

    const tokenName = tokenData.attributes.name || "Data not available";
    const tokenSymbol = tokenData.attributes.symbol || "Data not available";
    const price = tokenData.attributes.price_usd || "Data not available";
    const marketCap = tokenData.attributes.market_cap_usd || "Data not available";
    const priceChange1h = tokenData.market_data.price_change_percentage_1h_in_currency.usd || "Data not available";
    const priceChange24h = tokenData.market_data.price_change_percentage_24h_in_currency.usd || "Data not available";
    const priceChange7d = tokenData.market_data.price_change_percentage_7d_in_currency.usd || "Data not available";
    const volume24h = tokenData.attributes.volume_usd || "Data not available";
    const totalSupply = tokenData.attributes.total_supply || "Data not available";

    const message = `
<b>${tokenName} (${tokenSymbol}) Analysis</b>
------------------------------
<b>Price Information</b>:
Price: $${price}
Market Cap: $${marketCap}
1H Change: ${priceChange1h}%
24H Change: ${priceChange24h}%
7D Change: ${priceChange7d}%
24H Volume: $${volume24h}
Total Supply: ${totalSupply}

    `;
    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "Sorry, I couldn't fetch token information right now.");
  }
};

interface WhaleTransaction {
  blockchain: string;
  symbol: string;
  amount: number;
  amount_usd: number;
  from: { owner: string | null };
  to: { owner: string | null };
  hash: string;
}

const generateWhaleReport = async (chatId: number): Promise<void> => {
  try {
    const whaleAlertApiKey = 'doWPYe5FmSRjevE7FwEIJGET3RG8Mj9b'; // Replace with your Whale Alert API key
    const startTime = Math.floor(Date.now() / 1000) - 60 * 5; // Transactions from the last 5 minutes
    const minTransactionValue = 1000000; // Minimum transaction value for whale alert

    const response: AxiosResponse<{ transactions: WhaleTransaction[] }> = await axios.get(
      `https://api.whale-alert.io/v1/transactions`, {
        params: {
          api_key: whaleAlertApiKey,
          min_value: minTransactionValue,
          start: startTime,
        }
      }
    );

    if (response.data && response.data.transactions && response.data.transactions.length > 0) {
      const transactions = response.data.transactions;
      transactions.forEach((transaction: WhaleTransaction) => {
        const blockchain = transaction.blockchain;
        const symbol = transaction.symbol;
        const amount = transaction.amount;
        const amountUSD = transaction.amount_usd;
        const from = transaction.from.owner || "Unknown";
        const to = transaction.to.owner || "Unknown";
        const hash = transaction.hash;

        const message = `
🚨 Whale Alert 🚨
Blockchain: ${blockchain.toUpperCase()}
Currency: ${symbol.toUpperCase()}
Amount: ${amount} (${amountUSD} USD)
From: ${from}
To: ${to}
Transaction Hash: ${hash}

Check it out: https://whale-alert.io/transaction/${blockchain}/${hash}`;
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      });
    } else {
      bot.sendMessage(chatId, "No recent whale transactions found.");
    }
  } catch (error) {
    console.error("Error fetching whale transactions:", (error as Error).message);
    bot.sendMessage(chatId, "Sorry, I couldn't fetch whale transactions right now.");
  }
};

const autoPostUpdates = (chatId: number) => {
    setInterval(() => generateWhaleReport(chatId), 300000); // Check every 5 minutes for whale transactions
    //setInterval(() => generateNewsReport(chatId), 1800000); // Check every 30 minutes for news updates
  };

// Full report function that calls all three functions
const generateFullReport = async (chatId: number, network: string, tokenName: string) => {
  //await generateTokenInfo(chatId, network, tokenAddress); // Generate token info
 // await generateNewsReport(chatId); // Generate news report
  await generateWhaleReport(chatId); // Generate whale report
};

// Token info command
bot.onText(/\/tokeninfo/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Create keyboard with network options
  const keyboard = availableNetworks.map(network => [{ text: network }]);
  
  // Send message with network selection
  await bot.sendMessage(chatId, 'Please select a network:', {
    reply_markup: {
      keyboard,
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });

  // Wait for user's network selection
  bot.once('message', async (networkMsg) => {
    const selectedNetwork = networkMsg?.text?.toLowerCase();
    
    if (selectedNetwork && availableNetworks.includes(selectedNetwork)) {
      // Ask for token address
      await bot.sendMessage(chatId, 'Please enter the token address:');
      
      // Wait for user's token address input
      bot.once('message', (addressMsg) => {
        const tokenAddress = addressMsg.text || '';
        generateTokenInfo(chatId, selectedNetwork, tokenAddress);
      });
    } else {
      bot.sendMessage(chatId, 'Invalid network selection. Please try again with /tokeninfo');
    }
  });
});

// News report command
bot.onText(/\/newsreport/, (msg) => {
  const chatId = msg.chat.id;
  //generateNewsReport(chatId); // Call the news report function
});

// Whale report command
bot.onText(/\/whalereport/, (msg) => {
  const chatId = msg.chat.id;
  generateWhaleReport(chatId); // Call the whale report function
});

// Full report command
bot.onText(/\/fullreport/, (msg) => {
  const chatId = msg.chat.id;
  //generateFullReport(chatId); // Call all three functions to generate a full report
});

autoPostUpdates(chatIdForUpdates);