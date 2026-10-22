import { JOBS } from '../game/constants';
import type { ResultInfo } from '../game/types';

interface Props {
  result: ResultInfo;
  isHost: boolean;
  debug: boolean;
}

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

export function ResultModal({ result, isHost, debug }: Props) {
  const maxDamage = Math.max(1, ...result.dps.map((row) => row.damage));
  const total = result.dps.reduce((sum, row) => sum + row.damage, 0) || 1;
  return (
    <div className="modal">
      <div className="modal-card">
        <h2 className={`modal-title ${result.outcome === 'victory' ? 'good' : 'bad'}`}>
          {result.outcome === 'victory' ? '任务完成' : '任务失败'}
        </h2>
        <div className="modal-sub">
          {result.reason} · 用时 {formatDuration(result.duration)} · 共 {result.dps.length} 名队员
        </div>
        <table className="dps-table">
          <thead>
            <tr>
              <th>#</th>
              <th>队员</th>
              <th>职业</th>
              <th>伤害</th>
              <th>占比</th>
            </tr>
          </thead>
          <tbody>
            {result.dps.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td>
                  {row.name}
                  {row.bot ? ' (人机)' : ''}
                </td>
                <td>{JOBS[row.job].name}</td>
                <td>{row.damage.toLocaleString()}</td>
                <td>
                  {Math.round((row.damage / total) * 100)}%
                  <div className="dps-cellbar">
                    <i style={{ width: `${Math.max(4, (row.damage / maxDamage) * 100)}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-foot">
          <div className="note">
            {isHost ? '刷新页面即可重新开团' : '等队长重开，或者刷新页面重新加入'}
            <br />
            {debug ? '本局战斗日志已写入 raid_events，可在控制台数据页查看。' : '换个职业，再来一局？'}
          </div>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            重新开团
          </button>
        </div>
      </div>
    </div>
  );
}
