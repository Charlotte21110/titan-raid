import { ENRAGE_SECONDS } from '../game/constants';
import type { Phase, Snapshot } from '../game/types';

interface Props {
  snapshot: Snapshot | null;
  phase: Phase;
  latency: number;
  cdcCount: number;
  hostOnline: boolean;
  isHost: boolean;
  spectator: boolean;
  debug: boolean;
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

export function TopBar({ snapshot, phase, latency, cdcCount, hostOnline, isHost, spectator, debug }: Props) {
  const hp = snapshot?.boss.hp ?? 24000;
  const maxHp = snapshot?.boss.maxHp ?? 24000;
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const enrage = snapshot?.boss.enrageIn ?? ENRAGE_SECONDS;
  const elapsed = snapshot?.elapsed ?? 0;
  const round = snapshot?.round ?? 1;
  const timerPct = Math.max(0, Math.min(100, (enrage / ENRAGE_SECONDS) * 100));

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">泰</span>
        <span>
          泰坦讨伐战
          <div className="brand-sub">{debug ? 'TITAN RAID · CLOUDBASE PG REALTIME' : 'TITAN RAID · 4 PLAYER RAID'}</div>
        </span>
      </div>

      <div className="boss-wrap">
        <div className="boss-head">
          <span className="boss-name">泰坦 · TITAN</span>
          <span className="boss-hp-text">
            {hp.toLocaleString()} / {maxHp.toLocaleString()}
          </span>
        </div>
        <div className="hp-track">
          <div className="hp-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className={`combat-timer${enrage < 30 ? ' danger' : ''}`}>
        <div className="timer-main">{formatTime(enrage)}</div>
        <div className="timer-label">狂暴倒计时</div>
        <div className="timer-bar">
          <i style={{ width: `${timerPct}%` }} />
        </div>
        <div className="timer-elapsed">已战斗 {formatTime(elapsed)}</div>
      </div>

      <div className="top-meta">
        <span className="pill yellow">第 {round} 轮</span>
        <span className="pill">
          {phase === 'lobby' ? '待开团' : phase === 'fighting' ? '战斗中' : phase === 'victory' ? '已通关' : '已团灭'}
        </span>
        <span className="pill">
          <i className={`dot${latency > 0 && latency < 300 ? ' on' : latency >= 300 ? ' warn' : ''}`} />
          {latency ? `${latency}ms` : '--'}
        </span>
        {spectator ? <span className="pill">观战</span> : null}
        {!hostOnline ? <span className="pill red">{debug ? '房主已离开' : '队长已离开'}</span> : null}
        {isHost ? <span className="pill green">{debug ? '房主' : '队长'}</span> : null}
        {debug ? <span className="pill">raid:main</span> : null}
        {debug ? <span className="pill blue">CDC {cdcCount}</span> : null}
      </div>
    </header>
  );
}
