export type GlucosePoint = {
  observedAt: Date;
  mgdl: number;
};

export type TirResult = {
  totalPoints: number;
  lowCount: number;
  inRangeCount: number;
  highCount: number;
  lowPercent: number;
  inRangePercent: number;
  highPercent: number;
  targetLowMgdl: number;
  targetHighMgdl: number;
};

type TirOptions = {
  targetLowMgdl?: number;
  targetHighMgdl?: number;
};

const DEFAULT_TARGET_LOW = 70;
const DEFAULT_TARGET_HIGH = 180;

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function calculateTir(
  points: GlucosePoint[],
  options: TirOptions = {},
): TirResult {
  const targetLow = options.targetLowMgdl ?? DEFAULT_TARGET_LOW;
  const targetHigh = options.targetHighMgdl ?? DEFAULT_TARGET_HIGH;

  if (targetLow >= targetHigh) {
    throw new Error("targetLowMgdl must be less than targetHighMgdl");
  }

  const validPoints = points.filter(
    (p) => Number.isFinite(p.mgdl) && p.observedAt instanceof Date,
  );

  let lowCount = 0;
  let inRangeCount = 0;
  let highCount = 0;

  for (const p of validPoints) {
    if (p.mgdl < targetLow) lowCount += 1;
    else if (p.mgdl > targetHigh) highCount += 1;
    else inRangeCount += 1;

  }

  const totalPoints = validPoints.length;
  return {
    totalPoints,
    lowCount,
    inRangeCount,
    highCount,
    lowPercent: pct(lowCount, totalPoints),
    inRangePercent: pct(inRangeCount, totalPoints),
    highPercent: pct(highCount, totalPoints),
    targetLowMgdl: targetLow,
    targetHighMgdl: targetHigh,
  };
}
