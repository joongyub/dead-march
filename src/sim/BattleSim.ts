import { Army, parseOp } from './Army';
import {
  ROAD_CENTER,
  ROAD_LEFT,
  ROAD_RIGHT,
  ROAD_WIDTH,
  type BossKind,
  type LevelData,
  type ParsedOp,
  type TierDef,
  type ZombieKind,
} from './types';

/** Distance ahead of the crowd's center where melee contact happens. */
export const CONTACT = 70;
const CROWD_MAX_SPEED = 1700; // sideways, units/s
const DEFAULT_SPEED = 420;
const CLASH_SPEED_FACTOR = 0.12;
const BOSS_SPAWN_AHEAD = 1150;

export interface SimHorde {
  id: number;
  kindId: string;
  kind: ZombieKind;
  z: number;
  x0: number;
  x1: number;
  count: number;
  count0: number;
  hpAcc: number;
  active: boolean;
  engaged: boolean;
  aggro: boolean;
}

export interface SimGate {
  id: number;
  z: number;
  left: ParsedOp;
  right: ParsedOp;
  passed: boolean;
  /** 0 = left, 1 = right, -1 = not passed yet. */
  chosen: -1 | 0 | 1;
}

export interface SimBarricade {
  id: number;
  z: number;
  x0: number;
  x1: number;
  hp: number;
  hp0: number;
  active: boolean;
  engaged: boolean;
}

export interface SimBoss {
  kindId: string;
  kind: BossKind;
  z: number;
  hp: number;
  hp0: number;
  dps: number;
  active: boolean;
  attacking: boolean;
}

export type SimEvent =
  | { type: 'gate'; gate: SimGate; side: 0 | 1; powerBefore: number }
  | { type: 'merge'; tier: number; groups: number }
  | { type: 'hordeCleared'; horde: SimHorde; byMelee: boolean }
  | { type: 'hordeMissed'; horde: SimHorde }
  | { type: 'clash'; horde: SimHorde }
  | { type: 'barricadeSmashed'; barricade: SimBarricade }
  | { type: 'barricadeBroken'; barricade: SimBarricade }
  | { type: 'bossStart'; boss: SimBoss }
  | { type: 'won' }
  | { type: 'lost' };

export type Phase = 'run' | 'boss' | 'won' | 'lost';

export type TargetKind = 'none' | 'horde' | 'barricade' | 'boss';

export interface BattleModifiers {
  /** Extra survivors at the start (shelter wall upgrades). */
  startBonus: number;
  /** Multiplier on all ranged damage (armory upgrades). */
  dpsMultiplier: number;
  /** Extra units per merge, e.g. 0.1 = one free unit every ten merges (garage upgrades). */
  mergeBonus?: number;
}

export interface BattleRules {
  tiers: readonly TierDef[];
  zombies: Record<string, ZombieKind>;
  bosses: Record<string, BossKind>;
}

export interface BattleStats {
  zombiesKilled: number;
  /** Power lost to zombies, barricades and the boss (not to gate choices). */
  damageTaken: number;
  gatesTaken: number;
  peakPower: number;
  time: number;
}

/**
 * Deterministic battle rules, stepped at a fixed rate. Holds no rendering state and uses no randomness,
 * so the balance simulator reproduces exactly what a player sees for the same inputs.
 */
export class BattleSim {
  readonly army: Army;
  readonly hordes: SimHorde[] = [];
  readonly gates: SimGate[] = [];
  readonly barricades: SimBarricade[] = [];
  readonly boss: SimBoss;
  /** Discrete happenings since the view last drained them. */
  readonly events: SimEvent[] = [];
  readonly stats: BattleStats = { zombiesKilled: 0, damageTaken: 0, gatesTaken: 0, peakPower: 0, time: 0 };

  phase: Phase = 'run';
  distance = 0;
  speed = 0;
  crowdX = ROAD_CENTER;
  targetX = ROAD_CENTER;
  /** What the army is shooting this step, and how hard (zombie HP per second). */
  targetKind: TargetKind = 'none';
  targetHorde: SimHorde | null = null;
  targetBarricade: SimBarricade | null = null;
  /** Zombie group behind the target that piercing shots (machine gunners) also hit, if any. */
  pierceHorde: SimHorde | null = null;
  firePower = 0;

  private readonly baseSpeed: number;
  private readonly dpsMultiplier: number;

  constructor(
    readonly level: LevelData,
    readonly rules: BattleRules,
    modifiers: BattleModifiers = { startBonus: 0, dpsMultiplier: 1 },
  ) {
    this.army = new Army(rules.tiers, modifiers.mergeBonus ?? 0);
    this.army.reset(level.start + modifiers.startBonus);
    this.baseSpeed = level.speed ?? DEFAULT_SPEED;
    this.speed = this.baseSpeed;
    this.dpsMultiplier = modifiers.dpsMultiplier;

    let id = 0;
    for (const ev of level.events) {
      const [x0, x1] = laneOf(ev.type === 'gate' ? undefined : ev.x, ev.type === 'gate' ? undefined : ev.w);
      if (ev.type === 'gate') {
        this.gates.push({ id: id++, z: ev.z, left: parseOp(ev.left), right: parseOp(ev.right), passed: false, chosen: -1 });
      } else if (ev.type === 'horde') {
        const kind = rules.zombies[ev.kind];
        if (!kind) throw new Error(`Unknown zombie kind "${ev.kind}"`);
        this.hordes.push({
          id: id++, kindId: ev.kind, kind, z: ev.z, x0, x1, count: ev.count, count0: ev.count,
          hpAcc: 0, active: true, engaged: false, aggro: false,
        });
      } else {
        this.barricades.push({ id: id++, z: ev.z, x0, x1, hp: ev.hp, hp0: ev.hp, active: true, engaged: false });
      }
    }
    const bossKind = rules.bosses[level.boss.kind];
    if (!bossKind) throw new Error(`Unknown boss "${level.boss.kind}"`);
    this.boss = {
      kindId: level.boss.kind, kind: bossKind, z: level.length + BOSS_SPAWN_AHEAD,
      hp: level.boss.hp, hp0: level.boss.hp, dps: level.boss.dps, active: false, attacking: false,
    };
    this.stats.peakPower = this.army.power;
  }

  /** Crowd radius in track units; grows with the number of units shown. */
  get crowdRadius(): number {
    return Math.min(150, 34 + 6.5 * Math.sqrt(Math.min(this.army.units, 120)));
  }

  /** Horizontal half-extent used for overlap tests (a little tighter than the drawn crowd). */
  get crowdHalfWidth(): number {
    return this.crowdRadius * 0.7;
  }

  get finished(): boolean {
    return this.phase === 'won' || this.phase === 'lost';
  }

  setTargetX(x: number): void {
    this.targetX = x;
  }

  step(dt: number): void {
    if (this.finished) return;
    this.stats.time += dt;
    this.moveCrowd(dt);

    let clashing = false;
    if (this.phase === 'run') {
      this.distance += this.speed * dt;
      this.passGates();
      clashing = this.updateHordes(dt) || clashing;
      clashing = this.updateBarricades(dt) || clashing;
      if (this.distance >= this.level.length) this.startBoss();
    } else if (this.phase === 'boss') {
      this.updateHordes(dt);
      this.updateBoss(dt);
    }

    this.shoot(dt);
    this.checkMerges();

    const targetSpeed = this.phase === 'run' ? (clashing ? this.baseSpeed * CLASH_SPEED_FACTOR : this.baseSpeed) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * (clashing ? 14 : 3));

    const power = this.army.power;
    if (power > this.stats.peakPower) this.stats.peakPower = power;
    if (power <= 0) {
      this.phase = 'lost';
      this.events.push({ type: 'lost' });
    }
  }

  private moveCrowd(dt: number): void {
    const half = this.crowdHalfWidth;
    const min = ROAD_LEFT + half * 0.6;
    const max = ROAD_RIGHT - half * 0.6;
    const target = Math.max(min, Math.min(max, this.targetX));
    const delta = target - this.crowdX;
    const maxMove = CROWD_MAX_SPEED * dt;
    this.crowdX += Math.abs(delta) <= maxMove ? delta : Math.sign(delta) * maxMove;
    this.crowdX = Math.max(min, Math.min(max, this.crowdX));
  }

  private overlaps(x0: number, x1: number): boolean {
    const half = this.crowdHalfWidth;
    return this.crowdX + half > x0 && this.crowdX - half < x1;
  }

  private passGates(): void {
    for (const gate of this.gates) {
      if (gate.passed || gate.z > this.distance) continue;
      gate.passed = true;
      const side: 0 | 1 = this.crowdX < ROAD_CENTER ? 0 : 1;
      gate.chosen = side;
      const powerBefore = this.army.power;
      this.army.apply(side === 0 ? gate.left : gate.right);
      this.stats.gatesTaken++;
      this.events.push({ type: 'gate', gate, side, powerBefore });
    }
  }

  private updateHordes(dt: number): boolean {
    let clashing = false;
    for (const h of this.hordes) {
      if (!h.active) continue;
      const ahead = h.z - this.distance;
      if (!h.aggro && ahead < h.kind.aggroRange) h.aggro = true;

      const lane = this.overlaps(h.x0, h.x1);
      if (h.engaged && !lane) h.engaged = false; // crowd slipped out sideways mid-fight

      if (!h.engaged && h.aggro && this.phase === 'run') {
        // Zombies shamble toward the crowd, but only within their own lane.
        h.z -= h.kind.speed * dt;
      }
      if (!h.engaged && lane && h.z - this.distance <= CONTACT && h.z - this.distance > -CONTACT) {
        h.engaged = true;
        this.events.push({ type: 'clash', horde: h });
      }
      if (h.engaged) {
        h.z = this.distance + CONTACT;
        clashing = true;
        this.meleeHorde(h, dt);
      } else if (h.z - this.distance < -260) {
        h.active = false;
        this.events.push({ type: 'hordeMissed', horde: h });
      }
    }
    return clashing;
  }

  private meleeHorde(h: SimHorde, dt: number): void {
    const clashTime = 0.45 + 0.18 * Math.log10(h.count0 + 1);
    const kills = Math.min(h.count, Math.max(1, Math.ceil((h.count0 * dt) / clashTime)));
    h.count -= kills;
    this.stats.zombiesKilled += kills;
    let loss = kills * h.kind.power;
    if (h.kind.blast) loss += kills * h.kind.blast;
    this.stats.damageTaken += this.army.damage(loss);
    if (h.count <= 0) {
      h.active = false;
      h.engaged = false;
      this.events.push({ type: 'hordeCleared', horde: h, byMelee: true });
    }
  }

  private updateBarricades(dt: number): boolean {
    let clashing = false;
    for (const b of this.barricades) {
      if (!b.active) continue;
      const ahead = b.z - this.distance;
      const lane = this.overlaps(b.x0, b.x1);
      if (b.engaged && !lane) b.engaged = false;
      if (!b.engaged && lane && ahead <= CONTACT && ahead > -CONTACT) {
        if (this.army.breaksBarricades) {
          b.active = false;
          this.events.push({ type: 'barricadeSmashed', barricade: b });
          continue;
        }
        b.engaged = true;
      }
      if (b.engaged) {
        clashing = true;
        const chew = Math.min(b.hp, Math.max(1, Math.ceil((b.hp0 * dt) / 0.7)));
        b.hp -= chew;
        this.stats.damageTaken += this.army.damage(chew);
        if (b.hp <= 0) {
          b.active = false;
          b.engaged = false;
          this.events.push({ type: 'barricadeBroken', barricade: b });
        }
      } else if (ahead < -260) {
        b.active = false;
      }
    }
    return clashing;
  }

  private startBoss(): void {
    this.phase = 'boss';
    this.distance = this.level.length;
    this.boss.active = true;
    this.events.push({ type: 'bossStart', boss: this.boss });
  }

  private updateBoss(dt: number): void {
    const boss = this.boss;
    if (!boss.active) return;
    const reach = CONTACT + boss.kind.radius * 0.5;
    if (boss.z - this.distance > reach) {
      boss.z = Math.max(this.distance + reach, boss.z - boss.kind.speed * dt);
      boss.attacking = false;
    } else {
      boss.attacking = true;
      this.stats.damageTaken += this.army.damage(boss.dps * dt);
    }
  }

  /** All shooters fire at one target: the nearest threat in the crowd's lane, else the nearest overall. */
  private shoot(dt: number): void {
    this.pickTarget();
    this.firePower = 0;
    if (this.targetKind === 'none') return;

    const h = this.targetHorde;
    const b = this.targetBarricade;
    const z = h ? h.z : b ? b.z : this.boss.z;
    const dps = this.army.dpsAt(Math.max(0, z - this.distance)) * this.dpsMultiplier;
    if (dps <= 0) return;
    this.firePower = dps;
    const damage = dps * dt;

    if (h) {
      this.damageHorde(h, damage);
    } else if (b) {
      b.hp -= damage;
      if (b.hp <= 0) {
        b.active = false;
        b.engaged = false;
        this.events.push({ type: 'barricadeBroken', barricade: b });
      }
    } else {
      this.boss.hp -= damage;
      if (this.boss.hp <= 0) {
        this.boss.hp = 0;
        this.boss.active = false;
        this.phase = 'won';
        this.events.push({ type: 'won' });
      }
    }

    const p = this.pierceHorde;
    if (p && p.active) {
      const pierce = this.army.pierceDpsAt(Math.max(0, p.z - this.distance)) * this.dpsMultiplier;
      if (pierce > 0) this.damageHorde(p, pierce * dt);
    }
  }

  private damageHorde(h: SimHorde, damage: number): void {
    h.hpAcc += damage;
    const kills = Math.min(h.count, Math.floor(h.hpAcc / h.kind.hp));
    if (kills > 0) {
      h.hpAcc -= kills * h.kind.hp;
      h.count -= kills;
      this.stats.zombiesKilled += kills;
    }
    if (h.count <= 0) {
      h.active = false;
      h.engaged = false;
      this.events.push({ type: 'hordeCleared', horde: h, byMelee: false });
    }
  }

  private pickTarget(): void {
    this.targetKind = 'none';
    this.targetHorde = null;
    this.targetBarricade = null;
    let bestZ = Infinity;
    let bestInLane = false;
    const minZ = this.distance - CONTACT;

    for (const h of this.hordes) {
      if (!h.active || h.z < minZ) continue;
      const inLane = this.overlaps(h.x0, h.x1);
      // Anything in the crowd's lane wins over things it can steer around.
      if ((inLane && !bestInLane) || (inLane === bestInLane && h.z < bestZ)) {
        this.targetKind = 'horde';
        this.targetHorde = h;
        bestZ = h.z;
        bestInLane = inLane;
      }
    }
    for (const b of this.barricades) {
      if (!b.active || b.z < minZ) continue;
      const inLane = this.overlaps(b.x0, b.x1);
      if ((inLane && !bestInLane) || (inLane === bestInLane && b.z < bestZ)) {
        this.targetKind = 'barricade';
        this.targetHorde = null;
        this.targetBarricade = b;
        bestZ = b.z;
        bestInLane = inLane;
      }
    }
    if (this.boss.active && (!bestInLane || this.boss.z < bestZ)) {
      this.targetKind = 'boss';
      this.targetHorde = null;
      this.targetBarricade = null;
    }

    // Piercing shots carry on into the nearest zombie group in the lane behind the target.
    this.pierceHorde = null;
    if (this.targetKind !== 'horde' && this.targetKind !== 'barricade') return;
    let pierceZ = Infinity;
    for (const h of this.hordes) {
      if (!h.active || h === this.targetHorde || h.z <= bestZ || h.z >= pierceZ) continue;
      if (!this.overlaps(h.x0, h.x1)) continue;
      this.pierceHorde = h;
      pierceZ = h.z;
    }
  }

  private checkMerges(): void {
    const merges = this.army.pendingMerges;
    for (let i = 0; i < merges.length; i++) {
      if (merges[i] > 0) {
        this.events.push({ type: 'merge', tier: i + 1, groups: merges[i] });
        merges[i] = 0;
      }
    }
  }
}

/** Converts level-data lane (center 0..1, width 0..1) to track x range. */
export function laneOf(x = 0.5, w = 1): [number, number] {
  const center = ROAD_LEFT + x * ROAD_WIDTH;
  const half = (w * ROAD_WIDTH) / 2;
  return [Math.max(ROAD_LEFT, center - half), Math.min(ROAD_RIGHT, center + half)];
}
