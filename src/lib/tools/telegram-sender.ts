const TELEGRAM_API = 'https://api.telegram.org/bot';
const MAX_MESSAGE_LENGTH = 4096;

export interface TelegramResult {
  success: boolean;
  messageIds?: number[];
  error?: string;
}

async function callTelegram(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; result?: { message_id: number }; description?: string }> {
  const response = await fetch(`${TELEGRAM_API}${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<{ ok: boolean; result?: { message_id: number }; description?: string }>;
}

/**
 * Split a long message into chunks that fit within Telegram's 4096 char limit.
 * Splits on newlines to avoid breaking mid-line.
 */
function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find the last newline within the limit
    let splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitAt === -1 || splitAt < MAX_MESSAGE_LENGTH / 2) {
      splitAt = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

/**
 * Send a text message via Telegram Bot API.
 * Automatically splits messages that exceed the 4096 char limit.
 */
export async function sendTelegramMessage(
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' };
  }

  const chunks = splitMessage(text);
  const messageIds: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await callTelegram(token, 'sendMessage', {
        chat_id: chatId,
        text: chunks[i],
        parse_mode: parseMode,
        disable_web_page_preview: true,
      });

      if (result.ok && result.result) {
        messageIds.push(result.result.message_id);
        break;
      }

      if (attempt === 3) {
        return {
          success: false,
          messageIds,
          error: `Failed to send chunk ${i + 1}/${chunks.length}: ${result.description}`,
        };
      }

      // Rate limit: wait before retry
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    // Small delay between chunks to avoid rate limits
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return { success: true, messageIds };
}

/**
 * Send a photo via Telegram Bot API (for chart images).
 */
export async function sendTelegramPhoto(
  base64Image: string,
  caption?: string
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set' };
  }

  // Convert base64 to a Blob for multipart upload
  const imageBuffer = Buffer.from(base64Image, 'base64');
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('photo', new Blob([imageBuffer], { type: 'image/png' }), 'chart.png');
  if (caption) {
    formData.append('caption', caption.slice(0, 1024)); // Telegram caption limit
    formData.append('parse_mode', 'HTML');
  }

  const response = await fetch(`${TELEGRAM_API}${token}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

  if (result.ok && result.result) {
    return { success: true, messageIds: [result.result.message_id] };
  }

  return { success: false, error: result.description || 'Failed to send photo' };
}
