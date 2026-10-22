export type Job = 'warrior' | 'white' | 'black' | 'summoner';
export type SkillKey = 'j' | 'k' | 'l';
export type Phase = 'lobby' | 'fighting' | 'victory' | 'wipe';

export type MechanicKind = 'mountain_buster' | 'landslide' | 'weight_of_land' | 'granite_gaol';

export interface SkillDef {
  key: SkillKey;
  name: string;
  cd: number;
  desc: string;
}

export interface JobDef {
  key: Job;
  name: string;
  short: string;
  role: string;
  color: string;
  maxHp: number;
  skills: Record<SkillKey, SkillDef>;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  job: Job;
  bot: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  gaoled: boolean;
  reviveIn: number;
  cd: Record<SkillKey, number>;
  rampage: number;
  mitigation: number;
  damageDealt: number;
  damageTaken: number;
}

export interface TelegraphSnapshot {
  id: string;
  kind: 'circle' | 'line' | 'buster';
  /** 圆心 / 起点（line、buster 为起点） */
  x: number;
  y: number;
  r?: number;
  /** 线段终点 */
  x2?: number;
  y2?: number;
  w?: number;
  remaining: number;
  total: number;
  mechanic: MechanicKind;
}

export interface GaolSnapshot {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  targetId: string;
  targetName: string;
  remaining: number;
}

export interface BossSnapshot {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  round: number;
  anim: 'idle' | 'attack' | 'death';
  animT: number;
  cast?: { mechanic: MechanicKind; name: string; remaining: number; total: number; targetId?: string };
  enrageIn: number;
}

export interface DpsRow {
  id: string;
  name: string;
  job: Job;
  bot: boolean;
  damage: number;
}

export interface ResultInfo {
  outcome: 'victory' | 'wipe';
  reason?: string;
  duration: number;
  dps: DpsRow[];
}

export interface Snapshot {
  ts: number;
  elapsed: number;
  phase: Phase;
  round: number;
  players: PlayerSnapshot[];
  boss: BossSnapshot;
  gaols: GaolSnapshot[];
  telegraphs: TelegraphSnapshot[];
  result?: ResultInfo;
}

export interface FxEvent {
  id: number;
  kind: 'hit' | 'cast' | 'death' | 'gaol-break' | 'stomp' | 'heal' | 'slash' | 'bolt' | 'ring';
  x: number;
  y: number;
  value?: number;
  crit?: boolean;
  text?: string;
  fromX?: number;
  fromY?: number;
  color?: string;
}

export interface PresenceMeta {
  clientId: string;
  name: string;
  job: Job;
  host: boolean;
  at: number;
}

export interface RosterEntry {
  id: string;
  name: string;
  job: Job;
  bot: boolean;
}

export interface MoveInput {
  kind: 'move';
  dx: number;
  dy: number;
  from: string;
}

export interface SkillInput {
  kind: 'skill';
  skill: SkillKey;
  from: string;
}

export type PlayerInput = MoveInput | SkillInput;
