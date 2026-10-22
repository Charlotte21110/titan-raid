import { useState } from 'react';
import type { LogEntry } from '../hooks/useRoom';

interface Props {
  entries: LogEntry[];
  debug: boolean;
}

const formatClock = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

export function CombatLog({ entries, debug }: Props) {
  const [open, setOpen] = useState(debug);
  return (
    <section className={`combat-log${open ? ' open' : ''}`}>
      <button type="button" className="log-toggle" onClick={() => setOpen((value) => !value)}>
        <span>战斗记录</span>
        <span>{open ? '收起' : `展开${entries.length ? ` (${entries.length})` : ''}`}</span>
      </button>
      {open ? (
        <div className="log">
          {debug ? (
            <div className="log-head">
              <span>public.raid_events</span>
              <span>INSERT 推送</span>
            </div>
          ) : null}
          {entries.length === 0 ? (
            <div className="log-empty">
              还没有战斗记录。
              {debug ? (
                <>
                  <br />
                  等待 raid_events 写入；若长时间没有事件，去控制台「发布」页确认 insert 事件位已开启。
                </>
              ) : null}
            </div>
          ) : (
            entries.map((entry) => (
              <div className="log-item" key={entry.id}>
                <span className="log-time">{formatClock(entry.at)}</span>
                <span className={`log-mark ${entry.tone}`} />
                <span className={`log-text ${entry.tone}`}>{entry.text}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
