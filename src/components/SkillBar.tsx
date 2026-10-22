import { JOBS } from '../game/constants';
import type { Job, PlayerSnapshot, SkillKey } from '../game/types';

interface Props {
  me: PlayerSnapshot | null;
  job: Job | null;
  onCast: (skill: SkillKey) => void;
  disabled?: boolean;
}

const KEYS: SkillKey[] = ['j', 'k', 'l'];

export function SkillBar({ me, job, onCast, disabled }: Props) {
  if (!job) {
    return (
      <footer className="skillbar">
        <div className="skill-hint">
          <b>WASD</b> 移动 · <b>J / K / L</b> 技能
          <br />
          进入大厅后选择职业
        </div>
      </footer>
    );
  }
  const def = JOBS[job];
  const locked = !me || !me.alive || me.gaoled || disabled;

  return (
    <footer className="skillbar">
      {KEYS.map((key) => {
        const skill = def.skills[key];
        const cd = me?.cd[key] ?? 0;
        const cooling = cd > 0.05;
        return (
          <button
            key={key}
            type="button"
            className={`skill${locked ? ' locked' : ''}`}
            onClick={() => onCast(key)}
            disabled={locked}
          >
            <div className="skill-main">
              <span className="skill-key">{key.toUpperCase()}</span>
              <span className="skill-name">{skill.name}</span>
            </div>
            <div className="skill-desc">{skill.desc}</div>
            {cooling ? <div className="skill-cd">{cd.toFixed(1)}</div> : null}
          </button>
        );
      })}
      <div className="skill-hint">
        <b>{def.name}</b> · {def.role}
        <br />
        {me ? (
          <>
            HP {me.hp} / {me.maxHp} · 输出 {me.damageDealt.toLocaleString()}
            <br />
            {me.gaoled ? '被石牢困住，等待队友转火' : me.alive ? 'WASD 移动 · J/K/L 技能' : `已倒地，${me.reviveIn}s 后自动复活`}
          </>
        ) : (
          '等待战斗开始'
        )}
      </div>
    </footer>
  );
}
