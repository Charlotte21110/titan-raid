import { JOBS, JOB_ORDER } from '../game/constants';
import type { Job, RosterEntry, Snapshot } from '../game/types';

interface Props {
  snapshot: Snapshot | null;
  roster: RosterEntry[];
  myId: string;
}

const jobOrder = (job: Job) => JOB_ORDER.indexOf(job);

export function TeamPanel({ snapshot, roster, myId }: Props) {
  const players = snapshot?.players ?? [];
  const rows = [...players].sort((a, b) => jobOrder(a.job) - jobOrder(b.job));
  const fallback = roster.filter((r) => !players.some((p) => p.id === r.id)).sort((a, b) => jobOrder(a.job) - jobOrder(b.job));

  return (
    <>
      <div className="side-title">
        <span>小队 / PARTY</span>
        <span>{players.length ? `${players.filter((p) => p.alive).length} / 4 存活` : `${roster.length} / 4 就位`}</span>
      </div>
      <div className="team">
        {rows.map((p) => {
          const def = JOBS[p.job];
          const pct = p.alive ? Math.max(0, (p.hp / p.maxHp) * 100) : 0;
          return (
            <div key={p.id} className={`pcard${p.id === myId ? ' me' : ''}${p.alive ? '' : ' dead'}`}>
              <div className="pcard-top">
                <span className={`job-chip jc-${p.job}`}>{def.short}</span>
                <span className="pname">{p.bot ? p.name.replace('亲信战友·', '') : p.name}</span>
                {p.bot ? <span className="tag bot">人机</span> : null}
                {!p.alive ? <span className="tag dead">倒地</span> : p.gaoled ? <span className="tag gaol">石牢</span> : null}
              </div>
              <div className="hp-mini">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="hp-num">
                <span>
                  {p.hp} / {p.maxHp}
                </span>
                <span>{p.alive ? `${Math.round((p.hp / p.maxHp) * 100)}%` : `${p.reviveIn}s 后复活`}</span>
              </div>
              <div className="buffs">
                {p.rampage > 0 ? <span className="buff">狂暴 {p.rampage}s</span> : null}
                {p.mitigation > 0 ? <span className="buff">减伤 {p.mitigation}s</span> : null}
                {p.id === myId ? <span className="buff">你</span> : null}
              </div>
            </div>
          );
        })}
        {fallback.map((r) => {
          const def = JOBS[r.job];
          return (
            <div key={r.id} className="pcard">
              <div className="pcard-top">
                <span className={`job-chip jc-${r.job}`}>{def.short}</span>
                <span className="pname">{r.name.replace('亲信战友·', '')}</span>
                {r.bot ? <span className="tag bot">人机</span> : <span className="tag">待命</span>}
              </div>
              <div className="hp-mini">
                <i className="hp-full" />
              </div>
              <div className="hp-num">
                <span>
                  {def.maxHp} / {def.maxHp}
                </span>
                <span>100%</span>
              </div>
              <div className="buffs" />
            </div>
          );
        })}
      </div>
    </>
  );
}
