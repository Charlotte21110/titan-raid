import { useEffect, useMemo, useState } from 'react';
import { JOBS, JOB_ORDER } from '../game/constants';
import type { Job, PresenceMeta } from '../game/types';
import type { ConnState } from '../hooks/useRoom';

interface Props {
  env: string;
  connState: ConnState;
  error: string;
  presence: PresenceMeta[];
  debug: boolean;
  onJoin: (name: string, job: Job) => void;
}

const randomName = () => `冒险者${Math.floor(1000 + Math.random() * 9000)}`;

export function JoinCard({ env, connState, error, presence, debug, onJoin }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('titan-name') || randomName());
  const [job, setJob] = useState<Job>('warrior');

  const taken = useMemo(() => {
    const map: Partial<Record<Job, string>> = {};
    for (const p of presence) {
      if (!map[p.job]) map[p.job] = p.name;
    }
    return map;
  }, [presence]);

  useEffect(() => {
    if (!taken[job]) return;
    const free = JOB_ORDER.find((item) => !taken[item]);
    if (free) setJob(free);
  }, [taken, job]);

  const connecting = connState === 'connecting' || connState === 'connected';

  const submit = () => {
    const finalName = name.trim().slice(0, 12) || randomName();
    localStorage.setItem('titan-name', finalName);
    onJoin(finalName, job);
  };

  return (
    <div className="join">
      <div className="join-card">
        <div className="join-kicker">{debug ? 'CLOUDBASE REALTIME · MULTIPLAYER RAID' : 'FOUR-PLAYER RAID · TITAN'}</div>
        <h1 className="join-title">
          泰坦<span>讨伐战</span>
        </h1>
        <p className="join-desc">
          四人小队，四个职业，一职业一位。缺人由「亲信战友」补位。
          {debug ? ' 大厅、移动、机制播报全部走 CloudBase PG Realtime。' : ' 手机可进房观战，建议用电脑开团。'}
        </p>

        <div className="howto">
          <div className="howto-row">
            <b>目标</b>
            <span>20 分钟内击破泰坦；全员倒地或倒计时归零失败</span>
          </div>
          <div className="howto-row">
            <b>操作</b>
            <span>WASD 移动，J / K / L 技能；也可以直接点下方技能卡</span>
          </div>
          <div className="howto-row">
            <b>机制</b>
            <span>山崩开减伤 · 落石离开红线 · 大地之重躲红圈 · 石牢集火打碎</span>
          </div>
          <div className="howto-row">
            <b>职业</b>
            <span>战士坦 / 白魔奶 / 黑魔召唤输出；一职业一位，先到先得</span>
          </div>
        </div>

        <label className="field-label" htmlFor="raid-name">
          冒险者名
        </label>
        <input
          id="raid-name"
          className="text-input"
          maxLength={12}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="输入名字"
        />

        <div className="field-label gap-top">选择职业（先到先得）</div>
        <div className="jobs">
          {JOB_ORDER.map((key) => {
            const def = JOBS[key];
            const owner = taken[key];
            const disabled = Boolean(owner);
            return (
              <button
                key={key}
                type="button"
                className={`job-btn job-${key}${job === key ? ' selected' : ''}`}
                disabled={disabled || connecting}
                onClick={() => setJob(key)}
              >
                <span className="job-swatch">{def.short}</span>
                <span>
                  <span className="job-name">{def.name}</span>
                  <span className="job-role">
                    {def.role} · {def.maxHp} HP
                  </span>
                  <span className="job-skill">
                    J {def.skills.j.name} / K {def.skills.k.name} / L {def.skills.l.name}
                  </span>
                </span>
                {owner ? <span className="tag">已占用</span> : null}
              </button>
            );
          })}
        </div>

        <div className="join-foot">
          <div className={`join-status${error ? ' err' : connState === 'connected' ? ' ok' : ''}`}>
            {error
              ? `连接失败：${error}`
              : connState === 'connecting'
                ? '正在进入副本…'
                : connState === 'connected'
                  ? '已连接，进入大厅'
                  : debug
                    ? `频道 raid:main · 环境 ${env}`
                    : '连接实时服务器'}
          </div>
          <button className="btn primary" type="button" onClick={submit} disabled={connecting}>
            {connecting ? '连接中…' : '进入大厅'}
          </button>
        </div>
      </div>
    </div>
  );
}
