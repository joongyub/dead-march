import { TIER_COUNT, type ParsedOp, type Tier, type TierDef } from './types';

/**
 * The player's army as unit counts per tier. Total power (survivor-equivalents) is what fights;
 * tiers decide how well the army shoots and whether it smashes barricades.
 *
 * Merging is automatic and power-neutral: 10 survivors become 1 soldier worth 10, and so on. The shelter
 * garage adds a bonus: every merge also yields `mergeBonus` extra units of the new tier, accumulated as
 * fractions so small merges still add up.
 * Damage eats the lowest tier first and breaks a higher unit into lower ones when needed.
 */
export class Army {
  readonly counts: number[] = new Array<number>(TIER_COUNT).fill(0);
  /** Merges performed per source tier since the owner last zeroed this (drives merge flashes). */
  readonly pendingMerges: number[] = new Array<number>(TIER_COUNT).fill(0);
  private pendingDamage = 0;
  /** Fractional bonus units waiting per tier (garage). */
  private readonly bonusAcc: number[] = new Array<number>(TIER_COUNT).fill(0);

  constructor(
    private readonly tiers: readonly TierDef[],
    private readonly mergeBonus = 0,
  ) {}

  get power(): number {
    let total = 0;
    for (let i = 0; i < TIER_COUNT; i++) total += this.counts[i] * this.tiers[i].power;
    return total;
  }

  get units(): number {
    let total = 0;
    for (let i = 0; i < TIER_COUNT; i++) total += this.counts[i];
    return total;
  }

  get alive(): boolean {
    return this.power > 0;
  }

  /** Combined zombie HP per second the army deals to a target `dist` units ahead. */
  dpsAt(dist: number): number {
    let dps = 0;
    for (let i = 0; i < TIER_COUNT; i++) {
      if (this.tiers[i].range >= dist) dps += this.counts[i] * this.tiers[i].dps;
    }
    return dps;
  }

  /** Damage per second that pierces through the target, from tiers that reach `dist`. */
  pierceDpsAt(dist: number): number {
    let dps = 0;
    for (let i = 0; i < TIER_COUNT; i++) {
      const tier = this.tiers[i];
      if (tier.pierce && tier.range >= dist) dps += this.counts[i] * tier.dps * tier.pierce;
    }
    return dps;
  }

  get breaksBarricades(): boolean {
    for (let i = 0; i < TIER_COUNT; i++) if (this.counts[i] > 0 && this.tiers[i].breaksBarricades) return true;
    return false;
  }

  reset(survivors: number): void {
    this.counts.fill(0);
    this.counts[0] = survivors;
    this.pendingDamage = 0;
    this.bonusAcc.fill(0);
    this.normalize();
    this.pendingMerges.fill(0);
  }

  add(tier: Tier, n: number): void {
    this.counts[tier] += Math.max(0, Math.floor(n));
    this.normalize();
  }

  /** Scales every tier, carrying fractional units down as lower-tier power. */
  scale(factor: number): void {
    let carry = 0;
    for (let i = TIER_COUNT - 1; i >= 0; i--) {
      const value = this.counts[i] * factor + carry / this.tiers[i].power;
      const whole = Math.floor(value + 1e-9);
      this.counts[i] = whole;
      carry = (value - whole) * this.tiers[i].power;
    }
    this.normalize();
  }

  /** Removes power, lowest tier first. Fractions (from continuous damage) accumulate. Returns power lost. */
  damage(amount: number): number {
    this.pendingDamage += amount;
    let remaining = Math.floor(this.pendingDamage);
    if (remaining <= 0) return 0;
    this.pendingDamage -= remaining;
    const before = this.power;

    for (let i = 0; i < TIER_COUNT && remaining > 0; i++) {
      const unitPower = this.tiers[i].power;
      // Whole units of this tier that fit inside the remaining damage.
      const take = Math.min(this.counts[i], Math.floor(remaining / unitPower));
      this.counts[i] -= take;
      remaining -= take * unitPower;
      if (remaining <= 0) break;
      if (this.counts[i] > 0) {
        // Break one unit of this tier down into survivors to absorb the leftover damage.
        this.counts[i] -= 1;
        this.counts[0] += unitPower - remaining;
        remaining = 0;
      }
    }
    if (remaining > 0) this.counts.fill(0);
    this.normalize();
    return before - this.power;
  }

  apply(op: ParsedOp): void {
    switch (op.kind) {
      case 'add':
        this.add(op.tier, op.value);
        break;
      case 'sub':
        this.damage(op.value * this.tiers[op.tier].power);
        break;
      case 'mul':
        this.scale(op.value);
        break;
      case 'div':
        this.scale(1 / op.value);
        break;
      case 'merge':
        this.evolve();
        break;
      case 'split':
        this.split(SPLIT_FACTOR);
        break;
    }
  }

  /** Merge gate: every full group evolves one tier right away, ignoring mergeKeep. Power stays the same. */
  evolve(): void {
    for (let i = TIER_COUNT - 2; i >= 0; i--) {
      const cost = this.tiers[i].mergeCost;
      if (!cost) continue;
      const groups = Math.floor(this.counts[i] / cost);
      if (groups <= 0) continue;
      this.counts[i] -= groups * cost;
      this.counts[i + 1] += groups + this.bonusUnits(i + 1, groups);
      this.pendingMerges[i] += groups;
    }
  }

  /** Split gate: each unit above survivor breaks into `factor` times the units it was merged from. */
  split(factor: number): void {
    // Ascending, so a tank becomes gunners but those gunners are not split again in the same pass.
    for (let i = 1; i < TIER_COUNT; i++) {
      const n = this.counts[i];
      if (n <= 0) continue;
      const cost = this.tiers[i - 1].mergeCost ?? 1;
      this.counts[i] = 0;
      this.counts[i - 1] += Math.floor(n * cost * factor);
    }
    this.normalize();
  }

  /** Auto-merge: excess units above mergeKeep fold into the next tier. */
  private normalize(): void {
    for (let i = 0; i < TIER_COUNT - 1; i++) {
      const { mergeCost, mergeKeep = 0 } = this.tiers[i];
      if (!mergeCost) continue;
      const excess = this.counts[i] - mergeKeep;
      if (excess < mergeCost) continue;
      const groups = Math.floor(excess / mergeCost);
      this.counts[i] -= groups * mergeCost;
      this.counts[i + 1] += groups + this.bonusUnits(i + 1, groups);
      this.pendingMerges[i] += groups;
    }
  }

  /** Whole bonus units earned by `groups` merges into `tier`; the fraction carries to the next merge. */
  private bonusUnits(tier: number, groups: number): number {
    if (this.mergeBonus <= 0) return 0;
    const acc = this.bonusAcc[tier] + groups * this.mergeBonus;
    const whole = Math.floor(acc);
    this.bonusAcc[tier] = acc - whole;
    return whole;
  }
}

/** How many more units a split gate gives back than went into the merge. */
export const SPLIT_FACTOR = 1.5;

const OP_PATTERN = /^\s*([+\-x×*/÷])\s*(\d+(?:\.\d+)?)\s*(survivor|soldier|gunner|tank)?\s*$/i;
const TIER_BY_ID: Record<string, Tier> = { survivor: 0, soldier: 1, gunner: 2, tank: 3 };

export function parseOp(text: string): ParsedOp {
  const word = text.trim().toLowerCase();
  if (word === 'merge' || word === 'split') return { kind: word, value: 1, tier: 0 };
  const match = OP_PATTERN.exec(text);
  if (!match) throw new Error(`Bad gate op "${text}"`);
  const symbol = match[1];
  const value = Number(match[2]);
  const tier = match[3] ? TIER_BY_ID[match[3].toLowerCase()] : 0;
  const kind = symbol === '+' ? 'add' : symbol === '-' ? 'sub' : symbol === '/' || symbol === '÷' ? 'div' : 'mul';
  return { kind, value, tier };
}

/** Whether a gate op helps the army (blue) or hurts it (red). */
export function isGoodOp(op: ParsedOp): boolean {
  return op.kind === 'add' || op.kind === 'merge' || op.kind === 'split' || (op.kind === 'mul' && op.value >= 1);
}

/** Label shown on a gate, e.g. "+20", "x2", "/3", "+1" with a tier icon drawn beside it. Empty for word gates. */
export function opLabel(op: ParsedOp): string {
  if (op.kind === 'merge' || op.kind === 'split') return '';
  const symbol = op.kind === 'add' ? '+' : op.kind === 'sub' ? '-' : op.kind === 'mul' ? 'x' : '/';
  return `${symbol}${op.value}`;
}
