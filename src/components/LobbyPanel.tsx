import { BOT_NAMES, JOBS, JOB_ORDER } from '../game/constants';
import type { PresenceMeta } from '../game/types';

interface Props {
  presence: PresenceMeta[];
  isHost: boolean;
  hostOnline: boolean;
  lastState: { boss_hp: number; boss_hp_max: number; phase: string; round: number } | null;
  debug: boolean;
  onStart: () => void;
}

export function LobbyPanel({ presence, isHost, hostOnline, lastState, debug, onStart }: Props) {
  const slots = JOB_ORDER.map((job) => {
    const human = presence.find((p) => p.job === job);
    return { job, human };
  });
  const humans = slots.filter((slot) => slot.human).length;

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-head">
          <div className="lobby-title">集结</div>
          <div className="lobby-sub">
            {debug ? 'raid:main · ' : ''}
            {humans} / 4 名冒险者
          </div>
        </div>
        <div className="slots">
          {slots.map(({ job, human }) => {
            const def = JOBS[job];
            return (
              <div key={job} className={`slot${human ? '' : ' bot'}`}>
                <div className={`slot-job jc-${job}`}>{def.name}</div>
                <div className="slot-name">{human ? human.name : BOT_NAMES[job]}</div>
                <div className="slot-role">{human ? `${def.role}${human.host ? (debug ? ' · 房主' : ' · 队长') : ''}` : '亲信战友 · 自动补位'}</div>
              </div>
            );
          })}
        </div>
        <div className="lobby-tips">
          山崩 → 坦克开减伤 · 落石 → 离开红线 · 大地之重 → 躲红圈 · 石牢 → 集火打碎救人
        </div>
        <div className="lobby-foot">
          <div className="lobby-note">
            一职业一位，先到先得。不足 4 人点「出发」由亲信战友补位。
            <br />
            {hostOnline
              ? isHost
                ? debug
                  ? '你是房主，可以开团。'
                  : '你是队长，可以开团。'
                : debug
                  ? '等待房主开团…'
                  : '等待队长开团…'
              : debug
                ? '房主已离开，请刷新页面重进。'
                : '队长已离开，请刷新页面重进。'}
            {debug && lastState ? (
              <>
                <br />
                raid_state 最近记录：Boss {lastState.boss_hp.toLocaleString()} / {lastState.boss_hp_max.toLocaleString()} · {lastState.phase} · 第 {lastState.round || 1} 轮
              </>
            ) : null}
          </div>
          {isHost ? (
            <button className="btn primary" type="button" onClick={onStart} disabled={!hostOnline}>
              出发
            </button>
          ) : (
            <button className="btn" type="button" disabled>
              {debug ? '等待房主' : '等待队长'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
