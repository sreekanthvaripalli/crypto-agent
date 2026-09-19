import axios from 'axios';
import { EnhancedCoinAnalysis, SignalCategory } from '../types';

export interface WebhookConfig {
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
}

/**
 * Dispatch alert notifications to Telegram / Discord when high-confidence signals occur.
 */
export class Notifier {
  private config: WebhookConfig;

  constructor(config?: WebhookConfig) {
    this.config = {
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
      discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
      ...config,
    };
  }

  async sendSignalAlert(coin: EnhancedCoinAnalysis): Promise<void> {
    const icon = coin.category === 'BUY' ? '🟢' : coin.category === 'AVOID' ? '🔴' : '🟡';
    const title = `${icon} Crypto Alert: ${coin.coin.name} (${coin.coin.symbol}) classified as ${coin.category}`;
    const details = [
      `Price: $${coin.coin.currentPrice}`,
      `24h Change: ${coin.coin.priceChange24hPercent.toFixed(2)}%`,
      `Score: ${coin.score}`,
      `Top Signal: ${coin.signals[0] || 'N/A'}`,
    ].join('\n');

    const message = `*${title}*\n${details}`;

    await Promise.allSettled([
      this.sendTelegram(message),
      this.sendDiscord(title, details, coin.category),
    ]);
  }

  private async sendTelegram(message: string): Promise<void> {
    if (!this.config.telegramBotToken || !this.config.telegramChatId) return;
    const url = `https://api.telegram.org/bot${this.config.telegramBotToken}/sendMessage`;
    try {
      await axios.post(url, {
        chat_id: this.config.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      console.error(`Telegram notification error: ${(err as Error).message}`);
    }
  }

  private async sendDiscord(title: string, description: string, category: SignalCategory): Promise<void> {
    if (!this.config.discordWebhookUrl) return;
    const color = category === 'BUY' ? 0x22c55e : category === 'AVOID' ? 0xef4444 : 0xeab308;
    try {
      await axios.post(this.config.discordWebhookUrl, {
        embeds: [
          {
            title,
            description,
            color,
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      console.error(`Discord notification error: ${(err as Error).message}`);
    }
  }
}

