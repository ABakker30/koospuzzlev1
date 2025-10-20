// Auto-break threshold calculations
// Maps Low/Medium/High to concrete force/torque limits based on actual sphere masses

export type BreakLevel = "low" | "medium" | "high";

const MULTIPLIER: Record<BreakLevel, number> = {
  low: 1.5,
  medium: 3.0,
  high: 6.0,
};

type Clamps = { fMin: number; fMax: number };
const CLAMPS: Record<BreakLevel, Clamps> = {
  low: { fMin: 1, fMax: 5_000 },
  medium: { fMin: 2, fMax: 10_000 },
  high: { fMin: 5, fMax: 20_000 },
};

interface RigidBody {
  mass(): number;
  handle: number;
}

interface ImpulseJoint {
  handle: number;
  body1(): number;
  body2(): number;
}

interface RigidBodySet {
  get(handle: number): RigidBody | null;
}

export function computeJointThresholds(
  level: BreakLevel,
  gAbs: number, // e.g., Math.abs(gravity.y) = 9.81
  getRadius: (body: RigidBody) => number,
  bodySet: RigidBodySet,
  joints: ImpulseJoint[]
): Map<number, { fTh: number; tauTh: number }> {
  const k = MULTIPLIER[level];
  const { fMin, fMax } = CLAMPS[level];

  const out = new Map<number, { fTh: number; tauTh: number }>();

  for (const j of joints) {
    const b1 = bodySet.get(j.body1());
    const b2 = bodySet.get(j.body2());
    if (!b1 || !b2) continue;

    const m1 = b1.mass();
    const m2 = b2.mass();
    const mBar = 0.5 * (m1 + m2);

    // Base force from local weight scale
    let fTh = k * mBar * gAbs;
    fTh = Math.max(fMin, Math.min(fTh, fMax));

    // Effective lever arm ~ average visual radius
    const rEff = 0.5 * (getRadius(b1) + getRadius(b2));
    const tauTh = fTh * Math.max(rEff, 1e-3); // avoid zero

    out.set(j.handle, { fTh, tauTh });
  }

  return out;
}

interface World {
  impulseJoints: {
    remove(joint: ImpulseJoint, wakeUp: boolean): void;
  };
}

export function breakJointsIfExceeded(
  world: World,
  joints: ImpulseJoint[],
  thresholds: Map<number, { fTh: number; tauTh: number }>,
  onBreak?: (j: ImpulseJoint) => void
) {
  const toRemove: ImpulseJoint[] = [];

  for (const j of joints) {
    const th = thresholds.get(j.handle);
    if (!th) continue;

    // Prefer built-in reaction if your Rapier build exposes it
    // For now, use stored estimate
    const fMag = (j as any)._lastEstimatedForce ?? 0;
    const tMag = (j as any)._lastEstimatedTorque ?? 0;

    if (fMag > th.fTh || tMag > th.tauTh) {
      toRemove.push(j);
    }
  }

  // Remove joints outside iteration
  for (const j of toRemove) {
    world.impulseJoints.remove(j, true);
    onBreak?.(j);
  }

  return toRemove.length;
}
