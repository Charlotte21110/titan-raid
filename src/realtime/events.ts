import { MECHANIC_META, ROOM_NAME } from '../game/constants';
import type { MechanicKind } from '../game/types';

export const CHANNEL_NAME = ROOM_NAME;

export const BROADCAST = {
  input: 'input',
  snapshot: 'snapshot',
  fx: 'fx',
  ping: 'ping',
  pong: 'pong',
  start: 'start',
} as const;

export const MECHANIC_TYPES: MechanicKind[] = [
  'mountain_buster',
  'landslide',
  'weight_of_land',
  'granite_gaol',
];

export function isMechanicType(type: string): type is MechanicKind {
  return (MECHANIC_TYPES as string[]).includes(type);
}

export function mechanicBanner(type: string): { title: string; call: string; color: string } | null {
  if (!isMechanicType(type)) return null;
  return MECHANIC_META[type];
}

/** CDC 行 → 战斗日志文案 */
export function describeEvent(type: string, payload: any): { text: string; tone: 'normal' | 'warn' | 'good' | 'bad' } {
  switch (type) {
    case 'start':
      return { text: `战斗开始 · ${payload?.roster?.length ?? 4} 人`, tone: 'good' };
    case 'mountain_buster':
      return { text: `山崩锁定 ${payload?.target ?? '?'}（${payload?.damage ?? '?'}）`, tone: 'warn' };
    case 'landslide':
      return { text: `落石预警 · ${payload?.angle ?? '?'}°`, tone: 'warn' };
    case 'weight_of_land':
      return { text: `大地之重 · ${payload?.circles?.length ?? 4} 个圈 + 全屏跺脚`, tone: 'warn' };
    case 'granite_gaol':
      return { text: `石牢点名 ${payload?.target ?? '?'} · ${payload?.timeout ?? 5}s 内打碎`, tone: 'warn' };
    case 'damage': {
      if (payload?.mechanic === 'granite_gaol') {
        return payload?.broken
          ? { text: `石牢被击碎 · ${payload?.target ?? ''} 获救`, tone: 'good' }
          : { text: `石牢超时 · ${payload?.hits?.[0]?.name ?? ''} 受到 500`, tone: 'bad' };
      }
      const hits = payload?.hits ?? [];
      const total = hits.reduce((sum: number, hit: any) => sum + (hit.amount ?? 0), 0);
      return { text: `伤害结算 · ${hits.length} 人中招 / 合计 ${total}`, tone: hits.length ? 'bad' : 'normal' };
    }
    case 'death':
      return { text: `${payload?.name ?? '?'} 倒地（${payload?.source ?? ''}）`, tone: 'bad' };
    case 'victory':
      return { text: `任务完成 · ${payload?.duration ?? 0}s`, tone: 'good' };
    case 'wipe':
      return { text: `任务失败 · ${payload?.reason ?? ''}`, tone: 'bad' };
    default:
      return { text: `${type}`, tone: 'normal' };
  }
}
