import { sendEmail } from '../tools/gmail-sender';
import { sendTelegramMessage, sendTelegramPhoto } from '../tools/telegram-sender';
import { loadWorkflow } from '../config/loader';
import type { InstrumentAnalysis, EconomicEvent, ChartImage, DeliveryResult, Bias } from '../types';

function biasEmoji(bias: Bias): string {
  return bias === 'BULLISH' ? '\u{1F7E2}' : bias === 'BEARISH' ? '\u{1F534}' : '\u{1F7E1}';
}

function slopeArrow(slope: string): string {
  if (slope === 'RISING') return '\u2191';
  if (slope === 'FALLING') return '\u2193';
  return '\u2194';
}

/**
 * Format the analysis into a Telegram-friendly message.
 * Uses Telegram HTML: <b>, <i>, <code>, <pre>
 */
function formatTelegramBriefing(
  instruments: InstrumentAnalysis[],
  events: EconomicEvent[],
  analysisText: string,
  qaConfidence: number,
  model: string
): string[] {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles',
  });

  // --- Message 1: Summary + Key Levels ---
  let msg1 = `<b>\u{1F4CA} Pre-Market Analysis</b>\n`;
  msg1 += `${today} \u2022 ${time} PST\n`;
  msg1 += `QA Confidence: ${qaConfidence}% \u2022 ${model}\n\n`;

  // Bias summary line
  msg1 += `<b>Bias:</b>\n`;
  for (const inst of instruments) {
    const consol = inst.consolidation.is15minConsolidating ? ' \u26A0\uFE0F CONSOL' : '';
    msg1 += `${biasEmoji(inst.bias)} <b>${inst.instrumentName}</b>: ${inst.bias} (${inst.overall.percentChange}%)${consol}\n`;
  }

  // PDH/PDL/PDC
  msg1 += `\n<b>Key Levels (PDH / PDL / PDC):</b>\n`;
  msg1 += `<pre>`;
  msg1 += `Instr    Current   PDH       PDL       PDC       Gap\n`;
  msg1 += `${'─'.repeat(62)}\n`;
  for (const inst of instruments) {
    const id = inst.instrumentId.toUpperCase().padEnd(8);
    const cur = String(inst.currentPrice).padEnd(10);
    const pdh = String(inst.previousDay.high).padEnd(10);
    const pdl = String(inst.previousDay.low).padEnd(10);
    const pdc = String(inst.previousDay.close).padEnd(10);
    const gap = inst.previousDay.gapFromPDC;
    msg1 += `${id}${cur}${pdh}${pdl}${pdc}${gap}\n`;
  }
  msg1 += `</pre>`;

  // EMA Levels
  msg1 += `\n<b>21 EMA Retest Zones:</b>\n`;
  msg1 += `<pre>`;
  msg1 += `Instr    10m EMA   15m EMA   60m EMA   15m Slope\n`;
  msg1 += `${'─'.repeat(55)}\n`;
  for (const inst of instruments) {
    const id = inst.instrumentId.toUpperCase().padEnd(8);
    const e10 = String(inst.emaLevels.ema21_10min ?? 'N/A').padEnd(10);
    const e15 = String(inst.emaLevels.ema21_15min ?? 'N/A').padEnd(10);
    const e60 = String(inst.emaLevels.ema21_60min ?? 'N/A').padEnd(10);
    const slope = `${slopeArrow(inst.emaLevels.slope15min)} ${inst.emaLevels.slope15min}`;
    msg1 += `${id}${e10}${e15}${e60}${slope}\n`;
  }
  msg1 += `</pre>`;

  // Swing Points
  msg1 += `\n<b>Overnight Swing Points:</b>\n`;
  for (const inst of instruments) {
    const highs = inst.swingPoints.recentHighs.map(h => h.price).join(', ') || 'none';
    const lows = inst.swingPoints.recentLows.map(l => l.price).join(', ') || 'none';
    msg1 += `<b>${inst.instrumentId.toUpperCase()}</b>: \u2191 ${highs} | \u2193 ${lows}\n`;
  }

  // Economic Events
  if (events.length > 0) {
    msg1 += `\n<b>\u{1F4C5} Economic Events:</b>\n`;
    for (const event of events.slice(0, 10)) {
      const icon = event.impact === 'HIGH' ? '\u{1F534}' : '\u{1F7E1}';
      msg1 += `${icon} <b>${event.time}</b> ${event.title}`;
      if (event.forecast !== '-') msg1 += ` (F: ${event.forecast})`;
      msg1 += `\n`;
    }
  } else {
    msg1 += `\n\u2705 No significant US news today.\n`;
  }

  // --- Message 2: Full AI Analysis ---
  // Clean up markdown for Telegram HTML
  let msg2 = `<b>\u{1F916} AI Trading Analysis</b>\n\n`;
  let cleanedAnalysis = analysisText
    .replace(/### (.*)/g, '\n<b>$1</b>')
    .replace(/## (.*)/g, '\n<b>$1</b>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  // Trim to fit (leave room for header)
  if (cleanedAnalysis.length > MAX_ANALYSIS_LENGTH) {
    cleanedAnalysis = cleanedAnalysis.slice(0, MAX_ANALYSIS_LENGTH) + '\n\n<i>[Truncated — see email for full analysis]</i>';
  }

  msg2 += cleanedAnalysis;

  return [msg1, msg2];
}

const MAX_ANALYSIS_LENGTH = 3800; // Leave room for header in 4096 char limit

export async function deliverReport(
  html: string,
  subject: string,
  instruments?: InstrumentAnalysis[],
  events?: EconomicEvent[],
  chartImages?: ChartImage[],
  analysisText?: string,
  qaConfidence?: number,
  model?: string
): Promise<DeliveryResult> {
  const workflow = loadWorkflow();
  const timestamp = new Date().toISOString();
  const channels = workflow.deliveryChannels ?? { telegram: true, email: true };

  // ===== PRIMARY: Telegram =====
  const hasTelegram = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;

  if (channels.telegram && hasTelegram && instruments && analysisText) {
    console.log('[Delivery] Sending via Telegram (primary)...');

    try {
      const messages = formatTelegramBriefing(
        instruments,
        events || [],
        analysisText,
        qaConfidence ?? 0,
        model ?? 'unknown'
      );

      // Send summary message
      const summaryResult = await sendTelegramMessage(messages[0]);
      if (!summaryResult.success) {
        throw new Error(`Telegram summary failed: ${summaryResult.error}`);
      }
      console.log('[Delivery] Telegram summary sent');

      // Send chart images (if available)
      if (chartImages) {
        for (const img of chartImages) {
          if (img.base64) {
            const inst = instruments.find(i => i.instrumentId === img.instrumentId);
            const caption = `${biasEmoji(inst?.bias || 'NEUTRAL')} <b>${inst?.instrumentName || img.instrumentId}</b> — 15min w/ MACD`;
            await sendTelegramPhoto(img.base64, caption);
            // Small delay between photos
            await new Promise(r => setTimeout(r, 300));
          }
        }
        console.log('[Delivery] Telegram chart images sent');
      }

      // Send analysis message
      const analysisResult = await sendTelegramMessage(messages[1]);
      if (!analysisResult.success) {
        console.warn(`[Delivery] Telegram analysis message failed: ${analysisResult.error}`);
        // Non-critical — summary already sent
      } else {
        console.log('[Delivery] Telegram analysis sent');
      }

      return {
        success: true,
        messageId: `telegram:${summaryResult.messageIds?.join(',')}`,
        timestamp,
      };
    } catch (telegramError) {
      console.error('[Delivery] Telegram failed, falling back to email:', telegramError);
      // Fall through to email
    }
  }

  // ===== EMAIL =====
  if (channels.email) {
    const recipients = workflow.emailRecipients.length > 0
      ? workflow.emailRecipients
      : (process.env.EMAIL_RECIPIENTS?.split(',').map(e => e.trim()).filter(Boolean) || []);

    if (recipients.length > 0) {
      console.log(`[Delivery] Sending email to ${recipients.length} recipients...`);
      const result = await sendEmail(recipients, subject, html);

      if (result.success) {
        console.log(`[Delivery] Email sent: ${result.messageId}`);
        return { success: true, messageId: result.messageId, timestamp };
      } else {
        console.error(`[Delivery] Email failed: ${result.error}`);
        return { success: false, timestamp, error: result.error };
      }
    } else {
      console.warn('[Delivery] Email enabled but no recipients configured');
    }
  }

  // No channels delivered successfully
  const enabledChannels = [channels.telegram && 'telegram', channels.email && 'email'].filter(Boolean);
  if (enabledChannels.length === 0) {
    return { success: false, timestamp, error: 'All delivery channels are disabled' };
  }
  return { success: false, timestamp, error: 'No delivery channel succeeded' };
}
