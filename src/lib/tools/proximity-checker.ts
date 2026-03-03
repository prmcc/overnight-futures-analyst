export interface ProximityResult {
  distance: number;
  percentDistance: number;
  isAlert: boolean;
}

export function checkProximity(currentPrice: number, level: number, alertThreshold = 0.001): ProximityResult {
  const distance = currentPrice - level;
  const percentDistance = level !== 0 ? Math.abs(distance / level) : 0;
  return {
    distance: parseFloat(distance.toFixed(6)),
    percentDistance: parseFloat(percentDistance.toFixed(6)),
    isAlert: percentDistance < alertThreshold,
  };
}
