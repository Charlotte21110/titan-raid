import type { Job, JobDef, MechanicKind } from './types';

export const ARENA = {
  /** 逻辑画布尺寸，渲染时按容器等比缩放 */
  width: 960,
  height: 660,
  cx: 480,
  cy: 348,
  r: 272,
};

export const BOSS = {
  x: 480,
  y: 176,
  maxHp: 24000,
  hitRadius: 84,
};

export const PLAYER_SPEED = 252;
export const PLAYER_RADIUS = 17;
export const FIRST_MECHANIC_AT = 5;
export const MECHANIC_INTERVAL = 12;
export const ENRAGE_SECONDS = 1200;
export const GAOL_HP = 300;
export const GAOL_TIMEOUT = 5;
export const AUTO_REVIVE_SECONDS = 15;
export const RAISE_CAST_SECONDS = 2;
export const SNAPSHOT_HZ = 10;
export const ROOM_NAME = 'raid:main';
export const TABLE_EVENTS = 'raid_events';
export const TABLE_STATE = 'raid_state';

export const JOBS: Record<Job, JobDef> = {
  warrior: {
    key: 'warrior',
    name: '战士',
    short: '战',
    role: '坦克',
    color: '#6ec8ff',
    maxHp: 1400,
    skills: {
      j: { key: 'j', name: '重斩', cd: 1.5, desc: '近战 100 伤害' },
      k: { key: 'k', name: '狂暴', cd: 20, desc: '8 秒内伤害 +50%' },
      l: { key: 'l', name: '战栗', cd: 25, desc: '回 300 HP，6 秒减伤 50%' },
    },
  },
  white: {
    key: 'white',
    name: '白魔',
    short: '白',
    role: '治疗',
    color: '#58d68d',
    maxHp: 1000,
    skills: {
      j: { key: 'j', name: '飞石', cd: 1.5, desc: '远程 90 伤害' },
      k: { key: 'k', name: '治疗 / 复活', cd: 5, desc: '奶最残队友 350；有人倒地则读条 2 秒复活' },
      l: { key: 'l', name: '医济', cd: 12, desc: '全队回复 200' },
    },
  },
  black: {
    key: 'black',
    name: '黑魔',
    short: '黑',
    role: '远程 DPS',
    color: '#9b8cff',
    maxHp: 1000,
    skills: {
      j: { key: 'j', name: '火炎', cd: 2, desc: '远程 130 伤害' },
      k: { key: 'k', name: '冰结', cd: 3, desc: '远程 90 伤害' },
      l: { key: 'l', name: '雷霆', cd: 10, desc: 'DOT 40 × 6 秒' },
    },
  },
  summoner: {
    key: 'summoner',
    name: '召唤',
    short: '召',
    role: '远程 DPS',
    color: '#ffd84d',
    maxHp: 1000,
    skills: {
      j: { key: 'j', name: '毁坏', cd: 1.8, desc: '远程 100 伤害' },
      k: { key: 'k', name: '毒菌', cd: 8, desc: 'DOT 30 × 8 秒' },
      l: { key: 'l', name: '瘴气', cd: 15, desc: 'AOE 80 伤害' },
    },
  },
};

export const JOB_ORDER: Job[] = ['warrior', 'white', 'black', 'summoner'];

export const MECHANIC_META: Record<MechanicKind, { title: string; call: string; color: string }> = {
  mountain_buster: { title: '山崩', call: '山崩 → 战士开减伤！', color: '#ff8a5c' },
  landslide: { title: '落石', call: '落石 → 侧移躲避！', color: '#ff6b6b' },
  weight_of_land: { title: '大地之重', call: '大地之重 → 躲圈！', color: '#ff6b6b' },
  granite_gaol: { title: '石牢', call: '石牢 → 转火救人！', color: '#ffcf4d' },
};

export const BOT_NAMES: Record<Job, string> = {
  warrior: '亲信战友·小盾',
  white: '亲信战友·小绿',
  black: '亲信战友·小黑',
  summoner: '亲信战友·小紫',
};

export const MECHANIC_CYCLE: MechanicKind[] = ['mountain_buster', 'landslide', 'weight_of_land', 'granite_gaol'];
