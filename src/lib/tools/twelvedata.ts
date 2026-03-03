import type { TwelveDataResponse } from '../types';

export async function fetchTimeSeries(
  symbol: string,
  interval: string,
  outputsize: number
): Promise<TwelveDataResponse> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY is not set');

  const params = new URLSearchParams({
    symbol,
    interval,
    outputsize: String(outputsize),
    apikey: apiKey,
  });

  const response = await fetch(`https://api.twelvedata.com/time_series?${params}`);
  if (!response.ok) {
    throw new Error(`TwelveData API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as TwelveDataResponse;
  if (data.status === 'error') {
    throw new Error(`TwelveData error: ${JSON.stringify(data)}`);
  }

  return data;
}
