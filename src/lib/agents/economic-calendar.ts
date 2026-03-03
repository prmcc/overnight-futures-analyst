import { fetchEconomicCalendar } from '../tools/myfxbook';
import type { EconomicEvent } from '../types';

export async function collectEconomicCalendar(): Promise<EconomicEvent[]> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    const events = await fetchEconomicCalendar(today);
    console.log(`[Economic Calendar] Found ${events.length} events for ${today}`);
    return events;
  } catch (error) {
    console.error('[Economic Calendar] Failed:', error);
    return [];
  }
}
