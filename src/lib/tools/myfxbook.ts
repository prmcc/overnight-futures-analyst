import { XMLParser } from 'fast-xml-parser';
import type { EconomicEvent } from '../types';

export async function fetchEconomicCalendar(date: string): Promise<EconomicEvent[]> {
  const url = `https://www.myfxbook.com/calendar_statement.xml?start=${date}%2000:00&end=${date}%2023:59&filter=2-3_USD&calPeriod=10`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'OvernightFuturesAnalyst/1.0' }
  });

  if (!response.ok) {
    console.warn(`Myfxbook calendar fetch failed: ${response.status}`);
    return [];
  }

  const xmlText = await response.text();
  return parseCalendarXML(xmlText);
}

function parseCalendarXML(xml: string): EconomicEvent[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  try {
    const parsed = parser.parse(xml);
    const events: EconomicEvent[] = [];

    // Try different XML structures
    let rows: unknown[] = [];
    if (parsed?.CalendarStatement?.row) {
      rows = Array.isArray(parsed.CalendarStatement.row)
        ? parsed.CalendarStatement.row
        : [parsed.CalendarStatement.row];
    } else if (parsed?.calendar?.event) {
      rows = Array.isArray(parsed.calendar.event)
        ? parsed.calendar.event
        : [parsed.calendar.event];
    }

    for (const row of rows) {
      const r = row as Record<string, string>;
      const title = r['@_title'] || r['title'] || r['@_name'] || r['name'] || '';
      const time = r['@_time'] || r['time'] || 'TBA';
      const impact = r['@_impact'] || r['impact'] || '2';
      const forecast = r['@_forecast'] || r['forecast'] || '-';
      const previous = r['@_previous'] || r['previous'] || '-';
      const actual = r['@_actual'] || r['actual'] || '-';
      const currency = r['@_currency'] || r['currency'] || 'USD';

      if (title) {
        events.push({
          time: time || 'TBA',
          title,
          currency,
          impact: impact === '3' ? 'HIGH' : impact === '2' ? 'MEDIUM' : 'LOW',
          forecast: forecast || '-',
          previous: previous || '-',
          actual: actual || '-',
        });
      }
    }

    // Sort by impact (HIGH first)
    const impactOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    events.sort((a, b) => (impactOrder[a.impact] ?? 2) - (impactOrder[b.impact] ?? 2));

    return events.slice(0, 20);
  } catch (e) {
    console.error('XML parse error:', e);
    return [];
  }
}
