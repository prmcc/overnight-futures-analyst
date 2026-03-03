import type { InstrumentAnalysis, EconomicEvent, ChartImage, ReportOutput, Bias } from '../types';

function getColor(bias: Bias): string {
  return bias === 'BULLISH' ? '#27ae60' : bias === 'BEARISH' ? '#e74c3c' : '#f39c12';
}

function getEmoji(bias: Bias): string {
  return bias === 'BULLISH' ? '\u{1F7E2}' : bias === 'BEARISH' ? '\u{1F534}' : '\u{1F7E1}';
}

function getSlopeBadge(slope: string): string {
  if (slope === 'RISING') return '<span style="color: #27ae60; font-weight: bold;">\u2191 RISING</span>';
  if (slope === 'FALLING') return '<span style="color: #e74c3c; font-weight: bold;">\u2193 FALLING</span>';
  return '<span style="color: #f39c12; font-weight: bold;">\u2194 FLAT</span>';
}

function getConsolidationBadge(isConsolidating: boolean): string {
  return isConsolidating
    ? '<span style="background: #e74c3c; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">CONSOLIDATING</span>'
    : '<span style="background: #27ae60; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">VOLATILE</span>';
}

function formatAnalysisHtml(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3 style="color: #1a1a2e; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 8px;">$1</h3>')
    .replace(/## (.*)/g, '<h2 style="color: #1a1a2e; margin-top: 25px;">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

export function buildReport(
  instruments: InstrumentAnalysis[],
  events: EconomicEvent[],
  chartImages: ChartImage[],
  analysisText: string,
  qaConfidence: number,
  model: string
): ReportOutput {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const currentTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Los_Angeles' });

  // Build news table
  let newsTable = '';
  if (events.length > 0) {
    newsTable = '<table style="width:100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">' +
      '<tr style="background-color: #1a1a2e; color: white;">' +
      '<th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Time</th>' +
      '<th style="padding: 12px; border: 1px solid #ddd; text-align: left;">Event</th>' +
      '<th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Impact</th>' +
      '<th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Forecast</th>' +
      '<th style="padding: 12px; border: 1px solid #ddd; text-align: center;">Previous</th></tr>';
    for (const event of events) {
      const impactColor = event.impact === 'HIGH' ? '#e74c3c' : '#f39c12';
      newsTable += `<tr><td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${event.time}</td>` +
        `<td style="padding: 10px; border: 1px solid #ddd;">${event.title}</td>` +
        `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><span style="background: ${impactColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">${event.impact}</span></td>` +
        `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${event.forecast}</td>` +
        `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${event.previous}</td></tr>`;
    }
    newsTable += '</table>';
  } else {
    newsTable = '<div style="background: #d4edda; padding: 15px; border-radius: 8px; color: #155724;">No significant US news scheduled for today.</div>';
  }

  // Bias cards
  const biasCards = instruments.map(inst => {
    const color = getColor(inst.bias);
    return `<td style="width: ${100 / instruments.length}%; background: ${color}; padding: 15px 10px; border-radius: 10px; text-align: center; color: white;">` +
      `<div style="font-size: 11px; opacity: 0.9; margin-bottom: 5px;">${inst.instrumentName.toUpperCase()}</div>` +
      `<div style="font-size: 20px; font-weight: bold;">${inst.bias}</div>` +
      `<div style="font-size: 14px; margin-top: 5px;">${inst.overall.percentChange}%</div>` +
      `<div style="margin-top: 5px;">${getConsolidationBadge(inst.consolidation.is15minConsolidating)}</div></td>`;
  }).join('');

  // PDH/PDL/PDC table rows
  const pdRows = instruments.map((inst, i) => {
    const bg = i % 2 === 0 ? 'background: #f8f9fa;' : '';
    return `<tr style="${bg}">` +
      `<td style="padding: 10px; border: 1px solid #ddd; font-weight: 500;">${inst.instrumentName}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${inst.currentPrice}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: #27ae60;">${inst.previousDay.high}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: #e74c3c;">${inst.previousDay.low}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${inst.previousDay.close}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${inst.previousDay.gapFromPDC}</td></tr>`;
  }).join('');

  // EMA table rows
  const emaRows = instruments.map((inst, i) => {
    const bg = i % 2 === 0 ? 'background: #f8f9fa;' : '';
    return `<tr style="${bg}">` +
      `<td style="padding: 10px; border: 1px solid #ddd; font-weight: 500;">${inst.instrumentName}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${inst.currentPrice}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${inst.emaLevels.ema21_10min ?? 'N/A'}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${inst.emaLevels.ema21_15min ?? 'N/A'}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${inst.emaLevels.ema21_60min ?? 'N/A'}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${getSlopeBadge(inst.emaLevels.slope15min)}</td></tr>`;
  }).join('');

  // Swing points table rows
  const swingRows = instruments.map((inst, i) => {
    const bg = i % 2 === 0 ? 'background: #f8f9fa;' : '';
    const highs = inst.swingPoints.recentHighs.map(h => h.price).join(', ') || 'N/A';
    const lows = inst.swingPoints.recentLows.map(l => l.price).join(', ') || 'N/A';
    return `<tr style="${bg}">` +
      `<td style="padding: 10px; border: 1px solid #ddd; font-weight: 500;">${inst.instrumentName}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: #27ae60;">${highs}</td>` +
      `<td style="padding: 10px; border: 1px solid #ddd; text-align: center; color: #e74c3c;">${lows}</td></tr>`;
  }).join('');

  // Session stats rows
  const sessionRows = ['open', 'high', 'low', 'range'].map(metric => {
    const cells = instruments.map(inst => {
      const val = inst.overall[metric as keyof typeof inst.overall];
      const color = metric === 'high' ? 'color: #27ae60;' : metric === 'low' ? 'color: #e74c3c;' : '';
      return `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; ${color}">${val}</td>`;
    }).join('');
    return `<tr><td style="padding: 8px; border: 1px solid #ddd; font-weight: 500;">${metric.charAt(0).toUpperCase() + metric.slice(1)}</td>${cells}</tr>`;
  }).join('');

  const sessionBiasRows = ['tokyo', 'london', 'preNY'].map(session => {
    const bgMap: Record<string, string> = { tokyo: '#e8f4fd', london: '#fef9e7', preNY: '#fbeee6' };
    const nameMap: Record<string, string> = { tokyo: 'Tokyo', london: 'London', preNY: 'Pre-NY' };
    const cells = instruments.map(inst => {
      const s = inst[session as keyof InstrumentAnalysis] as { bias: string };
      return `<td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${s?.bias || 'N/A'}</td>`;
    }).join('');
    return `<tr style="background: ${bgMap[session]};"><td style="padding: 8px; border: 1px solid #ddd; font-weight: 700;">${nameMap[session]}</td>${cells}</tr>`;
  }).join('');

  const sessionHeader = instruments.map(inst =>
    `<th style="padding: 8px; text-align: center; border: 1px solid #ddd;">${inst.instrumentId.toUpperCase()}</th>`
  ).join('');

  // Chart images
  let chartsHtml = '';
  for (const img of chartImages) {
    if (img.base64) {
      const inst = instruments.find(i => i.instrumentId === img.instrumentId);
      chartsHtml += `<div style="margin-bottom: 20px;"><h4 style="color: #1a1a2e; margin: 0 0 10px;">${inst?.instrumentName || img.instrumentId}</h4>` +
        `<img src="data:image/png;base64,${img.base64}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);" alt="${inst?.instrumentName} Chart" /></div>`;
    }
  }

  // Assemble full email
  const emailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>` +
    `<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; margin: 0; padding: 20px;">` +
    `<div style="max-width: 900px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">` +
    // Header
    `<div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); color: white; padding: 35px; text-align: center;">` +
    `<h1 style="margin: 0; font-size: 28px; font-weight: 600;">Pre-Market Analysis</h1>` +
    `<p style="margin: 12px 0 0; opacity: 0.9; font-size: 16px;">${today}</p>` +
    `<p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px;">Generated at ${currentTime} PST | NY Session Preview | QA Confidence: ${qaConfidence}%</p>` +
    `<p style="margin: 5px 0 0; opacity: 0.6; font-size: 12px;">Model: ${model}</p></div>` +
    // Bias Cards
    `<div style="padding: 25px; background: #f8f9fa;"><table style="width: 100%; border-collapse: separate; border-spacing: 8px;"><tr>${biasCards}</tr></table></div>` +
    // Main Content
    `<div style="padding: 30px;">` +
    // News
    `<div style="margin-bottom: 30px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">Economic Events Today</h2>${newsTable}</div>` +
    // PDH/PDL/PDC
    `<div style="margin-bottom: 30px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">Previous Day Key Levels</h2>` +
    `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">` +
    `<tr style="background: #1a1a2e; color: white;"><th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Instrument</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Current</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">PDH</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">PDL</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">PDC</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Gap from PDC</th></tr>` +
    `${pdRows}</table></div>` +
    // EMA Levels
    `<div style="margin-bottom: 30px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">21 EMA Retest Zones</h2>` +
    `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">` +
    `<tr style="background: #1a1a2e; color: white;"><th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Instrument</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Current</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">10min EMA</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">15min EMA</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">60min EMA</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">15min Slope</th></tr>` +
    `${emaRows}</table></div>` +
    // Swing Points
    `<div style="margin-bottom: 30px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">Overnight Swing Points (SFP Targets)</h2>` +
    `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">` +
    `<tr style="background: #1a1a2e; color: white;"><th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Instrument</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Recent Swing Highs</th><th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Recent Swing Lows</th></tr>` +
    `${swingRows}</table></div>` +
    // Session Stats
    `<div style="margin-bottom: 30px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">Overnight Session Statistics</h2>` +
    `<table style="width: 100%; border-collapse: collapse; font-size: 12px;">` +
    `<tr style="background: #1a1a2e; color: white;"><th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Metric</th>${sessionHeader}</tr>` +
    `${sessionRows}${sessionBiasRows}</table></div>` +
    // Charts
    (chartsHtml ? `<div style="margin-bottom: 30px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">Chart Analysis</h2>${chartsHtml}</div>` : '') +
    // AI Analysis
    `<div style="margin-bottom: 20px;"><h2 style="color: #1a1a2e; font-size: 20px; margin: 0 0 15px;">AI Trading Analysis</h2>` +
    `<div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 25px; border-radius: 10px; border-left: 5px solid #3498db; line-height: 1.8;">` +
    `${formatAnalysisHtml(analysisText)}</div></div>` +
    `</div>` +
    // Footer
    `<div style="background: #1a1a2e; color: white; padding: 25px; text-align: center;">` +
    `<p style="margin: 0 0 10px; font-size: 13px;">Disclaimer: This analysis is for informational purposes only. Trade at your own risk.</p>` +
    `<p style="margin: 0; font-size: 12px; opacity: 0.7;">Generated by Overnight Futures Analyst | Data: Yahoo Finance + Myfxbook | Analysis: Claude via OpenRouter</p>` +
    `</div></div></body></html>`;

  // Build subject line with bias emojis
  const subject = `Pre-Market: ${instruments.map(i => `${i.instrumentId.toUpperCase()} ${getEmoji(i.bias)}`).join(' | ')} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return {
    emailHtml,
    subject,
    plainText: analysisText,
  };
}
