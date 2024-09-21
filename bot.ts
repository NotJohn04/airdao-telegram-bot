import TelegramBot from "node-telegram-bot-api";
import { Account, createWalletClient, formatEther, http, parseEther, publicActions } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import AirDaoTokenAbi from "./abi/AirDaoToken.json";
import { ADTBytecode } from "./constants/AirDaoTokenByteCode";
import dotenv from "dotenv";
import { airDaoMainnet, airDaoTestnet } from "./constants/AirDaoChain";

dotenv.config();

const token = process.env.BOTFATHER_TOKEN;
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
    transport: http('https://rpc.airdao.io', {
      timeout: 100000,
    }),
    chain: airDaoMainnet
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
      transport: http("https://rpc.airdao.io", {
        timeout: 100000,
      }),
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
    bot.sendMessage(chatId, 'Please create or import a wallet first.');
    return;
  }

  const { gasPrice } = await walletClients[chatId].estimateFeesPerGas({
    type: 'legacy'
  })

  console.log(gasPrice)
  // Check user's balance
  const balance = await walletClients[chatId].getBalance({
    address: account.address,
  });
  const minimumBalance = parseEther('0.01'); // Adjust this value as needed

  if (balance < minimumBalance) {
    bot.sendMessage(chatId, `Insufficient balance. You need at least 0.01 ETH to deploy the contract.`);
    return;
  }

  bot.sendMessage(chatId, `Balance: ${formatEther(balance)} $AMB`);

  bot.sendMessage(chatId, 'Please enter the token name:');
  bot.once('message', (nameMsg) => {
    const name = nameMsg.text!;
    bot.sendMessage(chatId, 'Please enter the token symbol:');
    bot.once('message', (symbolMsg) => {
      const symbol = symbolMsg.text!;
      bot.sendMessage(chatId, 'Please enter the total supply:');
      bot.once('message', async (supplyMsg) => {
        const supply = parseEther(supplyMsg.text!);
        
        // Review and confirm
        const confirmMessage = `Please review your token details:
Name: ${name}
Symbol: ${symbol}
Total Supply: ${formatEther(supply)} ${symbol}

Type 'confirm' to deploy the contract or 'cancel' to abort.`;
        
        bot.sendMessage(chatId, confirmMessage);
        bot.once('message', async (confirmMsg) => {
          if (confirmMsg.text?.toLowerCase() === 'confirm') {
            try {
              const hash = await walletClients[chatId].deployContract({
                account,
                abi: AirDaoTokenAbi,
                bytecode: ADTBytecode,
                args: [name, symbol, supply],
                type: 'legacy',
                chain: airDaoMainnet,
                gasPrice: 10,
              });
              bot.sendMessage(chatId, `Token creation transaction sent! Transaction hash: ${hash}\n\nPlease wait for the transaction to be mined.`);
            } catch (error) {
              console.log(error);
              bot.sendMessage(chatId, `Error creating token`);
            }
          } else {
            bot.sendMessage(chatId, 'Token creation cancelled.');
          }
        });
      });
    });
  });
});

console.log("Bot is running...");
