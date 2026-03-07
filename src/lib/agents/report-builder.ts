import type { InstrumentAnalysis, EconomicEvent, ChartImage, ReportOutput, Bias } from '../types';

function getColor(bias: Bias): string {
  return bias === 'BULLISH' ? '#27ae60' : bias === 'BEARISH' ? '#e74c3c' : '#f39c12';
}

function getEmoji(bias: Bias): string {
  return bias === 'BULLISH' ? '\u{1F7E2}' : bias === 'BEARISH' ? '\u{1F534}' : '\u{1F7E1}';
}

function getSlopeText(slope: string): string {
  if (slope === 'RISING') return '<span style="color:#27ae60;font-weight:bold;">\u2191 RISING</span>';
  if (slope === 'FALLING') return '<span style="color:#e74c3c;font-weight:bold;">\u2193 FALLING</span>';
  return '<span style="color:#f39c12;font-weight:bold;">\u2194 FLAT</span>';
}

function consolBadge(is: boolean): string {
  if (is) return '<span style="background:#e74c3c;color:#ffffff;padding:2px 6px;font-size:10px;">CONSOL</span>';
  return '<span style="background:#27ae60;color:#ffffff;padding:2px 6px;font-size:10px;">VOLATILE</span>';
}

function formatAnalysisHtml(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3 style="color:#1a1a2e;margin:18px 0 8px 0;font-size:16px;border-bottom:1px solid #dddddd;padding-bottom:6px;">$1</h3>')
    .replace(/## (.*)/g, '<h2 style="color:#1a1a2e;margin:22px 0 10px 0;font-size:18px;">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

/** Wraps content in a responsive table-based container */
function wrapContainer(content: string): string {
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>Pre-Market Analysis</title>
<!--[if mso]>
<style>table{border-collapse:collapse;}td,th{font-family:Arial,sans-serif;}</style>
<![endif]-->
<style>
body,table,td,th{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
@media only screen and (max-width:620px){
.stack{display:block!important;width:100%!important;max-width:100%!important;}
.stack-pad{padding:4px 0!important;}
.mob-full{width:100%!important;}
.mob-center{text-align:center!important;}
.mob-font-sm{font-size:12px!important;}
.mob-pad{padding:15px!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f0f2f5;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#333333;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5;">
<tr><td align="center" style="padding:20px 10px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;">
${content}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
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

  let html = '';

  // ===== HEADER =====
  html += `<tr><td style="background-color:#1a1a2e;color:#ffffff;padding:30px 20px;text-align:center;">
<h1 style="margin:0;font-size:24px;font-weight:600;color:#ffffff;">Pre-Market Analysis</h1>
<p style="margin:10px 0 0;font-size:15px;color:#cccccc;">${today}</p>
<p style="margin:4px 0 0;font-size:13px;color:#999999;">Generated at ${currentTime} PST | QA Confidence: ${qaConfidence}%</p>
<p style="margin:4px 0 0;font-size:11px;color:#777777;">${model}</p>
</td></tr>`;

  // ===== BIAS CARDS (2 per row for mobile) =====
  html += `<tr><td style="padding:15px 10px;background-color:#f0f2f5;">`;
  html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`;

  for (let i = 0; i < instruments.length; i += 2) {
    html += '<tr>';
    for (let j = i; j < Math.min(i + 2, instruments.length); j++) {
      const inst = instruments[j];
      const color = getColor(inst.bias);
      html += `<td class="stack" width="50%" style="padding:4px;" valign="top">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="background-color:${color};padding:12px 8px;text-align:center;color:#ffffff;">
<div style="font-size:11px;color:#eeeeee;">${inst.instrumentName.toUpperCase()}</div>
<div style="font-size:18px;font-weight:bold;margin:4px 0;">${inst.bias}</div>
<div style="font-size:13px;">${inst.overall.percentChange}%</div>
<div style="margin-top:4px;">${consolBadge(inst.consolidation.is15minConsolidating)}</div>
</td></tr></table></td>`;
    }
    // Pad with empty cell if odd number
    if (i + 1 >= instruments.length) {
      html += '<td class="stack" width="50%" style="padding:4px;"></td>';
    }
    html += '</tr>';
  }

  html += `</table></td></tr>`;

  // ===== ECONOMIC EVENTS =====
  html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Economic Events Today</h2>`;

  if (events.length > 0) {
    html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
<tr style="background-color:#1a1a2e;">
<th style="padding:8px;color:#ffffff;text-align:left;border:1px solid #333333;">Time</th>
<th style="padding:8px;color:#ffffff;text-align:left;border:1px solid #333333;">Event</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Impact</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Fcst</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Prev</th></tr>`;
    for (const event of events) {
      const impactColor = event.impact === 'HIGH' ? '#e74c3c' : '#f39c12';
      html += `<tr>
<td style="padding:7px 8px;border:1px solid #dddddd;font-weight:bold;white-space:nowrap;">${event.time}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;">${event.title}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;"><span style="background-color:${impactColor};color:#ffffff;padding:1px 6px;font-size:10px;">${event.impact}</span></td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${event.forecast}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${event.previous}</td></tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p style="background-color:#d4edda;padding:12px;color:#155724;margin:0;">No significant US news scheduled today.</p>`;
  }
  html += `</td></tr>`;

  // ===== PDH / PDL / PDC =====
  html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Previous Day Key Levels</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
<tr style="background-color:#1a1a2e;">
<th style="padding:8px;color:#ffffff;text-align:left;border:1px solid #333333;">Instr</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Current</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">PDH</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">PDL</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">PDC</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Gap</th></tr>`;
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const bg = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
    html += `<tr style="background-color:${bg};">
<td style="padding:7px 8px;border:1px solid #dddddd;font-weight:500;">${inst.instrumentId.toUpperCase()}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;font-weight:bold;">${inst.currentPrice}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;color:#27ae60;">${inst.previousDay.high}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;color:#e74c3c;">${inst.previousDay.low}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${inst.previousDay.close}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${inst.previousDay.gapFromPDC}</td></tr>`;
  }
  html += `</table></td></tr>`;

  // ===== EMA LEVELS =====
  html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">21 EMA Retest Zones</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
<tr style="background-color:#1a1a2e;">
<th style="padding:8px;color:#ffffff;text-align:left;border:1px solid #333333;">Instr</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Price</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">10m</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">15m</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">60m</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Slope</th></tr>`;
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const bg = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
    html += `<tr style="background-color:${bg};">
<td style="padding:7px 8px;border:1px solid #dddddd;font-weight:500;">${inst.instrumentId.toUpperCase()}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;font-weight:bold;">${inst.currentPrice}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${inst.emaLevels.ema21_10min ?? 'N/A'}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;font-weight:bold;">${inst.emaLevels.ema21_15min ?? 'N/A'}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${inst.emaLevels.ema21_60min ?? 'N/A'}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;">${getSlopeText(inst.emaLevels.slope15min)}</td></tr>`;
  }
  html += `</table></td></tr>`;

  // ===== SWING POINTS =====
  html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Overnight Swing Points</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
<tr style="background-color:#1a1a2e;">
<th style="padding:8px;color:#ffffff;text-align:left;border:1px solid #333333;">Instr</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Swing Highs</th>
<th style="padding:8px;color:#ffffff;text-align:center;border:1px solid #333333;">Swing Lows</th></tr>`;
  for (let i = 0; i < instruments.length; i++) {
    const inst = instruments[i];
    const bg = i % 2 === 0 ? '#f8f9fa' : '#ffffff';
    const highs = inst.swingPoints.recentHighs.map(h => h.price).join(', ') || 'N/A';
    const lows = inst.swingPoints.recentLows.map(l => l.price).join(', ') || 'N/A';
    html += `<tr style="background-color:${bg};">
<td style="padding:7px 8px;border:1px solid #dddddd;font-weight:500;">${inst.instrumentId.toUpperCase()}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;color:#27ae60;">${highs}</td>
<td style="padding:7px 8px;border:1px solid #dddddd;text-align:center;color:#e74c3c;">${lows}</td></tr>`;
  }
  html += `</table></td></tr>`;

  // ===== SESSION STATS =====
  html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Overnight Session Stats</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:12px;">
<tr style="background-color:#1a1a2e;">
<th style="padding:6px;color:#ffffff;text-align:left;border:1px solid #333333;">Metric</th>`;
  for (const inst of instruments) {
    html += `<th style="padding:6px;color:#ffffff;text-align:center;border:1px solid #333333;">${inst.instrumentId.toUpperCase()}</th>`;
  }
  html += `</tr>`;

  for (const metric of ['open', 'high', 'low', 'range'] as const) {
    html += `<tr>`;
    html += `<td style="padding:6px;border:1px solid #dddddd;font-weight:500;">${metric.charAt(0).toUpperCase() + metric.slice(1)}</td>`;
    for (const inst of instruments) {
      const val = inst.overall[metric as keyof typeof inst.overall];
      const color = metric === 'high' ? 'color:#27ae60;' : metric === 'low' ? 'color:#e74c3c;' : '';
      html += `<td style="padding:6px;border:1px solid #dddddd;text-align:center;${color}">${val}</td>`;
    }
    html += `</tr>`;
  }

  const sessions = [
    { key: 'tokyo', name: 'Tokyo', bg: '#e8f4fd' },
    { key: 'london', name: 'London', bg: '#fef9e7' },
    { key: 'preNY', name: 'Pre-NY', bg: '#fbeee6' },
  ];
  for (const s of sessions) {
    html += `<tr style="background-color:${s.bg};">`;
    html += `<td style="padding:6px;border:1px solid #dddddd;font-weight:700;">${s.name}</td>`;
    for (const inst of instruments) {
      const session = inst[s.key as keyof InstrumentAnalysis] as { bias: string } | undefined;
      html += `<td style="padding:6px;border:1px solid #dddddd;text-align:center;font-weight:bold;">${session?.bias || 'N/A'}</td>`;
    }
    html += `</tr>`;
  }
  html += `</table></td></tr>`;

  // ===== CHARTS =====
  const validCharts = chartImages.filter(img => img.base64);
  if (validCharts.length > 0) {
    html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">Chart Analysis</h2>`;
    for (const img of validCharts) {
      const inst = instruments.find(i => i.instrumentId === img.instrumentId);
      html += `<p style="margin:15px 0 6px;font-weight:bold;color:#1a1a2e;">${inst?.instrumentName || img.instrumentId}</p>
<img src="data:image/png;base64,${img.base64}" width="570" style="width:100%;max-width:570px;height:auto;display:block;" alt="${inst?.instrumentName || img.instrumentId} Chart">`;
    }
    html += `</td></tr>`;
  }

  // ===== AI ANALYSIS =====
  html += `<tr><td style="padding:20px 15px 0;">
<h2 style="margin:0 0 12px;font-size:18px;color:#1a1a2e;">AI Trading Analysis</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="background-color:#f8f9fa;padding:20px 15px;border-left:4px solid #3498db;line-height:1.7;font-size:14px;">
${formatAnalysisHtml(analysisText)}
</td></tr></table>
</td></tr>`;

  // ===== FOOTER =====
  html += `<tr><td style="background-color:#1a1a2e;color:#ffffff;padding:20px 15px;text-align:center;">
<p style="margin:0 0 8px;font-size:12px;color:#cccccc;">Disclaimer: This analysis is for informational purposes only. Trade at your own risk.</p>
<p style="margin:0;font-size:11px;color:#888888;">Overnight Futures Analyst | Yahoo Finance + Myfxbook | Claude via OpenRouter</p>
</td></tr>`;

  const emailHtml = wrapContainer(html);

  const subject = `Pre-Market: ${instruments.map(i => `${i.instrumentId.toUpperCase()} ${getEmoji(i.bias)}`).join(' | ')} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return {
    emailHtml,
    subject,
    plainText: analysisText,
  };
}
