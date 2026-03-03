export interface RiskRewardResult {
  risk: number;
  reward: number;
  ratio: number;
  isLong: boolean;
}

export function calculateRiskReward(entry: number, stopLoss: number, takeProfit: number): RiskRewardResult {
  const isLong = takeProfit > entry;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const ratio = risk > 0 ? reward / risk : 0;

  return {
    risk: parseFloat(risk.toFixed(6)),
    reward: parseFloat(reward.toFixed(6)),
    ratio: parseFloat(ratio.toFixed(2)),
    isLong,
  };
}
