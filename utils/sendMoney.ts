import { parseEther, formatEther } from 'viem'

export async function handleSendMoney(chatId: number, messageId: number, bot: any, walletClient: any) {
  if (!walletClient) {
    await bot.sendMessage(chatId, "❌ Please connect a wallet first.");
    return;
  }

  await bot.sendMessage(chatId, "Enter the recipient's address:");
  const recipientMsg = await new Promise(resolve => bot.once('message', resolve));
  const recipient = recipientMsg.text;

  await bot.sendMessage(chatId, `Enter the amount to send (in ${walletClient.chain.nativeCurrency.symbol}):`);
  const amountMsg = await new Promise(resolve => bot.once('message', resolve));
  const amount = parseEther(amountMsg.text);

  // Check balance
  const balance = await walletClient.getBalance({ address: walletClient.account.address });
  if (balance < amount) {
    await bot.sendMessage(chatId, "❌ Insufficient balance.");
    return;
  }

  try {
    const hash = await walletClient.sendTransaction({
      to: recipient,
      value: amount,
    });

    await bot.sendMessage(chatId, `✅ Transaction sent! Hash: ${hash}`);

    // Wait for transaction to be mined
    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    await bot.sendMessage(chatId, `✅ Transaction confirmed! Block number: ${receipt.blockNumber}`);

    // Update balance
    const newBalance = await walletClient.getBalance({ address: walletClient.account.address });
    await bot.sendMessage(chatId, `💰 New balance: ${formatEther(newBalance)} ETH`);
  } catch (error) {
    console.error("Error sending transaction:", error);
    await bot.sendMessage(chatId, "❌ Error sending transaction. Please try again.");
  }
}
