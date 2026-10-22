import { Board } from './components/Board';
import { CombatLog } from './components/CombatLog';
import { JoinCard } from './components/JoinCard';
import { LobbyPanel } from './components/LobbyPanel';
import { MechanicBanner } from './components/MechanicBanner';
import { ResultModal } from './components/ResultModal';
import { SkillBar } from './components/SkillBar';
import { TeamPanel } from './components/TeamPanel';
import { TopBar } from './components/TopBar';
import { BOT_NAMES, JOB_ORDER } from './game/constants';
import type { RosterEntry } from './game/types';
import { useRoom } from './hooks/useRoom';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

export default function App() {
  const room = useRoom();

  if (room.connState !== 'connected') {
    return (
      <JoinCard
        env={room.env}
        connState={room.connState}
        error={room.error}
        presence={room.presence}
        debug={DEBUG}
        onJoin={(name, job) => {
          void room.connect(name, job);
        }}
      />
    );
  }

  const snapshot = room.snapshot;
  const phase = snapshot?.phase ?? room.phase;
  const lobbyRoster: RosterEntry[] = JOB_ORDER.map((job) => {
    const human = room.presence.find((p) => p.job === job);
    return human
      ? { id: human.clientId, name: human.name, job, bot: false }
      : { id: `bot-${job}`, name: BOT_NAMES[job], job, bot: true };
  });

  return (
    <div className="app">
      <TopBar
        snapshot={snapshot}
        phase={phase}
        latency={room.latency}
        cdcCount={room.cdcCount}
        hostOnline={room.hostOnline}
        isHost={room.isHost}
        spectator={phase !== 'lobby' && !room.me}
        debug={DEBUG}
      />
      <main className="main">
        <section className="stage">
          <Board
            getFrame={room.getFrame}
            fxList={room.fxList}
            myId={room.myId}
            phase={phase}
            onMove={room.sendMove}
            onCast={room.castSkill}
            overlay={<MechanicBanner banner={room.banner} debug={DEBUG} />}
          />
          {phase === 'lobby' ? (
            <LobbyPanel
              presence={room.presence}
              isHost={room.isHost}
              hostOnline={room.hostOnline}
              lastState={room.lastState}
              debug={DEBUG}
              onStart={room.startGame}
            />
          ) : null}
          {room.notice ? <div className="toast">{room.notice}</div> : null}
        </section>
        <aside className="side">
          <TeamPanel snapshot={snapshot} roster={snapshot ? room.roster : lobbyRoster} myId={room.myId} />
          <CombatLog entries={room.cdcLog} debug={DEBUG} />
        </aside>
      </main>
      <SkillBar me={room.me} job={room.myJob} onCast={room.castSkill} disabled={phase !== 'fighting'} />
      {snapshot?.result ? <ResultModal result={snapshot.result} isHost={room.isHost} debug={DEBUG} /> : null}
    </div>
  );
}
