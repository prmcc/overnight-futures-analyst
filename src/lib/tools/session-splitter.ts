import type { OHLCVBar, SessionName } from '../types';

export function getSession(datetime: string, isUTC: boolean): SessionName {
  const parts = datetime.split(' ');
  if (parts.length < 2) return 'unknown';
  const hour = parseInt(parts[1].split(':')[0]);

  if (isUTC) {
    // UTC: Tokyo ~22:00-07:00, London ~07:00-13:00, Pre-NY ~13:00+
    if (hour >= 22 || hour < 7) return 'tokyo';
    if (hour >= 7 && hour < 13) return 'london';
    return 'preNY';
  } else {
    // ET: Tokyo ~18:00-02:00, London ~02:00-08:00, Pre-NY ~08:00+
    if (hour >= 18 || hour < 2) return 'tokyo';
    if (hour >= 2 && hour < 8) return 'london';
    return 'preNY';
  }
}

export interface SessionBars {
  tokyo: OHLCVBar[];
  london: OHLCVBar[];
  preNY: OHLCVBar[];
}

export function splitBySessions(bars: OHLCVBar[], isUTC: boolean): SessionBars {
  const result: SessionBars = { tokyo: [], london: [], preNY: [] };
  for (const bar of bars) {
    const session = getSession(bar.datetime, isUTC);
    if (session === 'tokyo') result.tokyo.push(bar);
    else if (session === 'london') result.london.push(bar);
    else if (session === 'preNY') result.preNY.push(bar);
  }
  return result;
}
