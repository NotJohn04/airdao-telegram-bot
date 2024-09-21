const TelegramBot = require('node-telegram-bot-api');
const token = '7150235945:AAEtqJac2elNI2VYF4ySJShGDWhizqftRbk'; // Replace with your bot token
const bot = new TelegramBot(token, { polling: true });

const axios = require('axios');

let lastWhaleTransactionHash = null;
let lastNewsTitle = null;

// Function to generate token info
const generateTokenInfo = async (chatId, tokenName) => {
  try {
    const formattedTokenName = tokenName.replace(/\s+/g, '-').toLowerCase();
    const coingeckoResponse = await axios.get(`https://api.coingecko.com/api/v3/coins/${formattedTokenName}`);

    const tokenData = coingeckoResponse.data;

    const price = tokenData.market_data.current_price.usd || "Data not available";
    const marketCap = tokenData.market_data.market_cap.usd || "Data not available";
    const priceChange1h = tokenData.market_data.price_change_percentage_1h_in_currency.usd || "Data not available";
    const priceChange24h = tokenData.market_data.price_change_percentage_24h_in_currency.usd || "Data not available";
    const priceChange7d = tokenData.market_data.price_change_percentage_7d_in_currency.usd || "Data not available";
    const volume24h = tokenData.market_data.total_volume.usd || "Data not available";
    const ath = tokenData.market_data.ath.usd || "Data not available";
    const atl = tokenData.market_data.atl.usd || "Data not available";
    const circulatingSupply = tokenData.market_data.circulating_supply || "Data not available";
    const maxSupply = tokenData.market_data.max_supply || "Data not available";
    const sentimentUp = tokenData.sentiment_votes_up_percentage || "Data not available";
    const sentimentDown = tokenData.sentiment_votes_down_percentage || "Data not available";

    const message = `
<b>${tokenName} Analysis</b>
------------------------------
<b>Price Information</b>:
Price: $${price}
Market Cap: $${marketCap}
1H Change: ${priceChange1h}%
24H Change: ${priceChange24h}%
7D Change: ${priceChange7d}%
24H Volume: $${volume24h}
All-Time High: $${ath}
All-Time Low: $${atl}
Circulating Supply: ${circulatingSupply}
Max Supply: ${maxSupply}

<b>Sentiment Analysis</b>:
👍 ${sentimentUp}% | 👎 ${sentimentDown}%
    `;
    bot.sendMessage(chatId, message, { parse_mode: "HTML" });
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "Sorry, I couldn't fetch token information right now.");
  }
};

// Function to fetch the latest news using the CryptoPanic API
const generateNewsReport = async (chatId) => {
  try {
    const cryptoPanicKey = 'cf2790b45e13a558af68c355732433ee44a64eed'; // Replace with your CryptoPanic API key
    const response = await axios.get(`https://cryptopanic.com/api/v1/posts/?auth_token=${cryptoPanicKey}`);
    const latestNews = response.data.results[0]; // Fetch latest news

    const message = `Latest Trending News: ${latestNews.title}\nLink: ${latestNews.url}`;
    bot.sendMessage(chatId, message);
  } catch (error) {
    console.error(error);
    bot.sendMessage(chatId, "Sorry, I couldn't fetch the latest news right now.");
  }
};

// Function to fetch whale transactions using Whale Alert API
const generateWhaleReport = async (chatId) => {
  try {
    const whaleAlertApiKey = 'doWPYe5FmSRjevE7FwEIJGET3RG8Mj9b'; // Replace with your Whale Alert API key
    const startTime = Math.floor(Date.now() / 1000) - 60 * 5; // Transactions from the last 5 minutes
    const minTransactionValue = 1000000; // Minimum transaction value for whale alert

    const response = await axios.get(`https://api.whale-alert.io/v1/transactions`, {
      params: {
        api_key: whaleAlertApiKey,
        min_value: minTransactionValue,
        start: startTime,
      }
    });

    if (response.data && response.data.transactions && response.data.transactions.length > 0) {
      const transactions = response.data.transactions;
      transactions.forEach(transaction => {
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

Check it out: https://whale-alert.io/transaction/${blockchain}/${hash}
        `;
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      });
    } else {
      bot.sendMessage(chatId, "No recent whale transactions found.");
    }
  } catch (error) {
    console.error("Error fetching whale transactions:", error.message);
    bot.sendMessage(chatId, "Sorry, I couldn't fetch whale transactions right now.");
  }
};

const autoPostUpdates = (chatId) => {
    setInterval(() => generateWhaleReport(chatId), 300000); // Check every 5 minutes for whale transactions
    setInterval(() => generateNewsReport(chatId), 1800000); // Check every 30 minutes for news updates
  };

// Full report function that calls all three functions
const generateFullReport = async (chatId) => {
  await generateTokenInfo(chatId); // Generate token info
  await generateNewsReport(chatId); // Generate news report
  await generateWhaleReport(chatId); // Generate whale report
};

// Token info command
bot.onText(/\/tokeninfo (.+)/, (msg, match) => { // Updated to capture user input
  const chatId = msg.chat.id;
  const tokenName = match[1]; // Get the token name from user input
  generateTokenInfo(chatId, tokenName); // Pass the token name to the function
});

// News report command
bot.onText(/\/newsreport/, (msg) => {
  const chatId = msg.chat.id;
  generateNewsReport(chatId); // Call the news report function
});

// Whale report command
bot.onText(/\/whalereport/, (msg) => {
  const chatId = msg.chat.id;
  generateWhaleReport(chatId); // Call the whale report function
});

// Full report command
bot.onText(/\/fullreport/, (msg) => {
  const chatId = msg.chat.id;
  generateFullReport(chatId); // Call all three functions to generate a full report
});

const chatIdForUpdates = 5939209582; // Replace with the chat ID where updates should be posted
autoPostUpdates(chatIdForUpdates);