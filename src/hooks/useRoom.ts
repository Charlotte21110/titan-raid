import { useCallback, useEffect, useRef, useState } from 'react';
import { ARENA, BOT_NAMES, JOBS, JOB_ORDER, PLAYER_RADIUS, PLAYER_SPEED } from '../game/constants';
import type { FxEvent, Job, Phase, PlayerInput, PresenceMeta, RosterEntry, Snapshot } from '../game/types';
import { connectRoom, type RoomConnection } from '../realtime/client';
import { CHANNEL_NAME, describeEvent, isMechanicType, mechanicBanner } from '../realtime/events';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'error';

export interface LogEntry {
  id: number;
  type: string;
  text: string;
  tone: 'normal' | 'warn' | 'good' | 'bad';
  at: number;
}

export interface BannerState {
  id: number;
  title: string;
  call: string;
  color: string;
}

const ENV = import.meta.env.VITE_CLOUDBASE_ENV_ID as string;
const REGION = (import.meta.env.VITE_CLOUDBASE_REGION as string) || 'ap-shanghai';
const ACCESS_KEY = import.meta.env.VITE_CLOUDBASE_ACCESS_KEY as string;

const flattenPresence = (state: Record<string, any[]>): PresenceMeta[] => {
  const result: PresenceMeta[] = [];
  Object.values(state || {}).forEach((metas) => {
    (metas || []).forEach((meta: any) => {
      if (!meta?.clientId) return;
      result.push({
        clientId: meta.clientId,
        name: String(meta.name || '无名'),
        job: (meta.job || 'warrior') as Job,
        host: Boolean(meta.host),
        at: Number(meta.at) || 0,
      });
    });
  });
  return result.sort((a, b) => a.at - b.at || a.clientId.localeCompare(b.clientId));
};

export function useRoom() {
  const [connState, setConnState] = useState<ConnState>('idle');
  const [error, setError] = useState('');
  const [presence, setPresence] = useState<PresenceMeta[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [cdcLog, setCdcLog] = useState<LogEntry[]>([]);
  const [cdcCount, setCdcCount] = useState(0);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [latency, setLatency] = useState(0);
  const [fxList, setFxList] = useState<FxEvent[]>([]);
  const [presenceHost, setPresenceHost] = useState(true);
  const [hostAlive, setHostAlive] = useState(true);
  const [lastState, setLastState] = useState<{ boss_hp: number; boss_hp_max: number; phase: string; round: number } | null>(null);
  const [myJob, setMyJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState('');

  const connRef = useRef<RoomConnection | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const frameRef = useRef<Snapshot | null>(null);
  const predictRef = useRef({ active: false, x: 0, y: 0, dx: 0, dy: 0, at: 0 });
  const snapshotRef = useRef<Snapshot | null>(null);
  const prevSnapshotRef = useRef<Snapshot | null>(null);
  const snapshotAtRef = useRef(0);
  const lastSnapshotAtRef = useRef(0);
  const snapshotGapRef = useRef(100);
  const myRef = useRef<{ clientId: string; name: string; job: Job } | null>(null);
  const hostRef = useRef(false);
  const hostIdRef = useRef<string | null>(null);
  const presenceRef = useRef<PresenceMeta[]>([]);
  const rosterRef = useRef<RosterEntry[]>([]);
  const startedRef = useRef(false);
  const jobAdjustedRef = useRef(false);
  const bannerTimer = useRef(0);
  const fxSeq = useRef(0);
  const logSeq = useRef(0);
  const phaseRef = useRef<Phase>('lobby');

  const setPhaseSafe = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const pushFx = useCallback((fx: Omit<FxEvent, 'id'> & { id?: number }) => {
    const item: FxEvent = { ...fx, id: fx.id ?? ++fxSeq.current };
    setFxList((list) => [...list.slice(-24), item]);
  }, []);

  const updateHost = useCallback((flat: PresenceMeta[]) => {
    const me = myRef.current;
    if (!me) return;
    // 开团后不再重新选举，避免中途进人把房主身份翻掉
    if (startedRef.current && hostIdRef.current) {
      hostRef.current = hostIdRef.current === me.clientId;
      setPresenceHost(flat.some((p) => p.clientId === hostIdRef.current));
      return;
    }
    const claimants = flat.filter((p) => p.host);
    const winner = claimants[0];
    if (winner) hostIdRef.current = winner.clientId;
    if (!hostIdRef.current) hostIdRef.current = me.clientId;
    hostRef.current = hostIdRef.current === me.clientId;
    setPresenceHost(flat.some((p) => p.clientId === hostIdRef.current));

    // 两个新客户端同时抢 host：at 较早者胜出，另一个让位
    const myMeta = flat.find((p) => p.clientId === me.clientId);
    if (winner && myMeta?.host && winner.clientId !== me.clientId) {
      void connRef.current?.track({ ...me, host: false, at: myMeta.at });
    }
  }, []);

  const handlePostgres = useCallback(
    (payload: any) => {
      const row = payload?.new;
      if (!row?.type) return;
      const { text, tone } = describeEvent(row.type, row.payload);
      logSeq.current += 1;
      const entry: LogEntry = { id: logSeq.current, type: row.type, text, tone, at: Date.now() };
      setCdcLog((list) => [entry, ...list].slice(0, 40));
      setCdcCount((count) => count + 1);
      if (isMechanicType(row.type)) {
        const meta = mechanicBanner(row.type);
        if (meta) {
          window.clearTimeout(bannerTimer.current);
          setBanner({ id: logSeq.current, ...meta });
          bannerTimer.current = window.setTimeout(() => setBanner(null), 3200);
        }
      }
    },
    [],
  );

  const handlePresence = useCallback(
    (state: Record<string, any[]>) => {
      const flat = flattenPresence(state);
      presenceRef.current = flat;
      setPresence(flat);
      updateHost(flat);

      // 两人同时抢同一职业：晚到的人自动换到空职业
      const me = myRef.current;
      const mine = me ? flat.find((p) => p.clientId === me.clientId) : undefined;
      if (!me || !mine || startedRef.current || jobAdjustedRef.current) return;
      const rival = flat.find(
        (p) =>
          p.job === mine.job &&
          p.clientId !== me.clientId &&
          (p.at < mine.at || (p.at === mine.at && p.clientId < me.clientId)),
      );
      if (!rival) return;
      const free = JOB_ORDER.find((job) => !flat.some((p) => p.job === job));
      if (!free) return;
      jobAdjustedRef.current = true;
      myRef.current = { ...me, job: free };
      void connRef.current?.track({ clientId: me.clientId, name: me.name, job: free, host: mine.host, at: mine.at });
      setMyJob(free);
      setNotice(`${JOBS[rival.job].name} 已被 ${rival.name} 占用，自动换到 ${JOBS[free].name}`);
    },
    [updateHost],
  );

  const handleBroadcast = useCallback(
    (event: string, payload: any) => {
      const me = myRef.current;
      if (event === 'snapshot' && payload?.players) {
        // 房主以 Worker 推来的帧为准，忽略自己 REST 广播的回声
        if (workerRef.current) return;
        const snap = payload as Snapshot;
        prevSnapshotRef.current = snapshotRef.current;
        snapshotRef.current = snap;
        lastSnapshotAtRef.current = performance.now();
        const now = performance.now();
        if (snapshotAtRef.current) {
          snapshotGapRef.current = Math.min(260, Math.max(60, now - snapshotAtRef.current));
        }
        snapshotAtRef.current = now;
        setSnapshot(snap);
        if (snap.phase !== 'lobby' && phaseRef.current === 'lobby') setPhaseSafe(snap.phase);
        return;
      }
      if (event === 'fx') {
        if (payload?.src && payload.src === me?.clientId) return;
        pushFx(payload);
        return;
      }
      if (event === 'start' && payload?.roster) {
        const list = payload.roster as RosterEntry[];
        rosterRef.current = list;
        setRoster(list);
        startedRef.current = true;
        setPhaseSafe('fighting');
        return;
      }
      if (event === 'input') {
        if (hostRef.current) workerRef.current?.postMessage({ type: 'input', input: payload as PlayerInput });
        return;
      }
      if (event === 'ping') {
        if (payload?.from && payload.from !== me?.clientId) {
          void connRef.current?.send('pong', { t: payload.t, from: me?.clientId });
        } else if (payload?.from === me?.clientId) {
          // 自发自收也能反映服务端往返时延（单机演示不至于显示 --）
          setLatency(Math.max(0, Math.min(999, Date.now() - payload.t)));
        }
        return;
      }
      if (event === 'pong') {
        if (payload?.from && payload.from !== me?.clientId && typeof payload.t === 'number') {
          setLatency(Math.max(0, Math.min(999, Date.now() - payload.t)));
        }
      }
    },
    [pushFx],
  );

  const connect = useCallback(
    async (name: string, job: Job) => {
      if (connRef.current) return;
      setConnState('connecting');
      setError('');
      try {
        const conn = await connectRoom(
          { env: ENV, region: REGION, accessKey: ACCESS_KEY },
          {
            onStatus: (status, detail) => {
              if (status === 'error') {
                setError(detail || '连接失败');
                setConnState('error');
              }
            },
            onBroadcast: handleBroadcast,
            onPresence: handlePresence,
            onPostgres: handlePostgres,
          },
        );
        connRef.current = conn;
        myRef.current = { clientId: conn.clientId, name, job };
        setMyJob(job);
        await conn.track({ clientId: conn.clientId, name, job, host: true, at: Date.now() });
        try {
          const res = await conn.db.from('raid_state').select('*').eq('room', 'main');
          const row = Array.isArray(res?.data) ? res.data[0] : null;
          if (row) {
            setLastState({
              boss_hp: Number(row.boss_hp) || 0,
              boss_hp_max: Number(row.boss_hp_max) || 0,
              phase: String(row.phase || 'idle'),
              round: Number(row.round) || 0,
            });
          }
        } catch {
          /* raid_state 读取失败不阻塞进房 */
        }
        setConnState('connected');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setConnState('error');
      }
    },
    [handleBroadcast, handlePresence, handlePostgres],
  );

  const broadcastSnapshot = (snap: Snapshot) => {
    void connRef.current?.send('snapshot', snap);
  };

  const startGame = useCallback(() => {
    if (!hostRef.current || workerRef.current) return;
    const me = myRef.current;
    if (!me) return;
    const flat = presenceRef.current.filter((p) => p.clientId !== me.clientId);
    const mine = { clientId: me.clientId, name: me.name, job: me.job, host: true, at: 0 };
    const all = [mine, ...flat];
    const used = new Set<string>();
    const list: RosterEntry[] = JOB_ORDER.map((job) => {
      const human = all.find((p) => p.job === job && !used.has(p.clientId));
      if (human) {
        used.add(human.clientId);
        return { id: human.clientId, name: human.name, job, bot: false };
      }
      return { id: `bot-${job}`, name: BOT_NAMES[job], job, bot: true };
    });
    rosterRef.current = list;
    setRoster(list);
    startedRef.current = true;
    setPhaseSafe('fighting');
    void connRef.current?.send('start', { roster: list });

    const speedParam = Number(new URLSearchParams(window.location.search).get('speed'));
    const speed = Number.isFinite(speedParam) && speedParam > 1 ? Math.min(3, speedParam) : 1;

    // 房主模拟放 Worker：隐藏标签页时主线程 setInterval 会被节流到 1s，Worker 不会
    const worker = new Worker(new URL('../game/hostWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    frameRef.current = null;
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.type === 'frame') {
        frameRef.current = message.snapshot as Snapshot;
        return;
      }
      if (message?.type === 'snapshot' || message?.type === 'snapshot-broadcast') {
        const snap = message.snapshot as Snapshot;
        frameRef.current = snap;
        prevSnapshotRef.current = snapshotRef.current;
        snapshotRef.current = snap;
        snapshotAtRef.current = performance.now();
        snapshotGapRef.current = 100;
        lastSnapshotAtRef.current = performance.now();
        setSnapshot(snap);
        if (message.type === 'snapshot-broadcast') broadcastSnapshot(snap);
        if (snap.phase !== phaseRef.current) setPhaseSafe(snap.phase);
        return;
      }
      if (message?.type === 'snapshot-fallback') {
        broadcastSnapshot(message.snapshot as Snapshot);
        return;
      }
      if (message?.type === 'state') {
        void connRef.current?.upsertState(message.row);
        return;
      }
      if (message?.type === 'event') {
        void connRef.current?.insertEvent(message.eventType, message.payload);
        return;
      }
      if (message?.type === 'fx') {
        pushFx(message.fx);
        void connRef.current?.send('fx', { ...message.fx, src: me.clientId });
      }
    };
    worker.postMessage({ type: 'start', roster: list, speed, env: ENV, accessKey: ACCESS_KEY, room: CHANNEL_NAME });
    worker.postMessage({ type: 'visibility', hidden: document.hidden });
  }, [pushFx]);

  const sendMove = useCallback((dx: number, dy: number) => {
    const me = myRef.current;
    if (!me) return;
    if (hostRef.current) {
      workerRef.current?.postMessage({ type: 'input', input: { kind: 'move', dx, dy, from: me.clientId } });
    } else {
      const len = Math.hypot(dx, dy);
      const nx = len ? dx / len : 0;
      const ny = len ? dy / len : 0;
      const pred = predictRef.current;
      const mine = snapshotRef.current?.players.find((p) => p.id === me.clientId);
      if (nx || ny) {
        if (!pred.active && mine?.alive && !mine.gaoled) {
          pred.active = true;
          pred.x = mine.x;
          pred.y = mine.y;
          pred.at = performance.now();
        }
        pred.dx = nx;
        pred.dy = ny;
      } else {
        pred.dx = 0;
        pred.dy = 0;
      }
      void connRef.current?.send('input', { kind: 'move', dx, dy, from: me.clientId });
    }
  }, []);

  const castSkill = useCallback((skill: 'j' | 'k' | 'l') => {
    const me = myRef.current;
    if (!me) return;
    if (hostRef.current) {
      workerRef.current?.postMessage({ type: 'input', input: { kind: 'skill', skill, from: me.clientId } });
    } else {
      void connRef.current?.send('input', { kind: 'skill', skill, from: me.clientId });
    }
  }, []);

  const getFrame = useCallback((): Snapshot | null => {
    if (workerRef.current) return frameRef.current;
    const curr = snapshotRef.current;
    const prev = prevSnapshotRef.current;
    if (!curr || !prev) return curr;
    // 快照之间做位置插值，客户端移动才不卡顿
    const t = Math.min(1, Math.max(0, (performance.now() - snapshotAtRef.current) / snapshotGapRef.current));
    const frame: Snapshot = {
      ...curr,
      boss: {
        ...curr.boss,
        x: prev.boss.x + (curr.boss.x - prev.boss.x) * t,
        y: prev.boss.y + (curr.boss.y - prev.boss.y) * t,
      },
      players: curr.players.map((p) => {
        const q = prev.players.find((item) => item.id === p.id);
        if (!q) return p;
        return {
          ...p,
          x: q.x + (p.x - q.x) * t,
          y: q.y + (p.y - q.y) * t,
          hp: Math.round(q.hp + (p.hp - q.hp) * t),
        };
      }),
    };

    // 本地预测：自己的角色立刻按键盘走，服务器快照只做纠偏
    const pred = predictRef.current;
    const mine = frame.players.find((p) => p.id === myRef.current?.clientId);
    if (!mine || !pred.active || !mine.alive || mine.gaoled) {
      pred.active = false;
      return frame;
    }
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - pred.at) / 1000));
    pred.at = now;
    if (pred.dx || pred.dy) {
      pred.x += pred.dx * PLAYER_SPEED * dt;
      pred.y += pred.dy * PLAYER_SPEED * dt;
    }
    const ox = pred.x - ARENA.cx;
    const oy = pred.y - ARENA.cy;
    const od = Math.hypot(ox, oy);
    const limit = ARENA.r - PLAYER_RADIUS - 6;
    if (od > limit) {
      pred.x = ARENA.cx + (ox / od) * limit;
      pred.y = ARENA.cy + (oy / od) * limit;
    }
    const err = Math.hypot(mine.x - pred.x, mine.y - pred.y);
    if (err > 150) {
      // 偏差过大（传送/长时间卡顿），以服务器为准
      pred.x = mine.x;
      pred.y = mine.y;
    } else if (!pred.dx && !pred.dy && err > 2) {
      // 松手后按原速滑向服务器最后位置，避免瞬间回拉
      const step = Math.min(err, PLAYER_SPEED * dt);
      pred.x += ((mine.x - pred.x) / err) * step;
      pred.y += ((mine.y - pred.y) / err) * step;
    }
    return {
      ...frame,
      players: frame.players.map((p) => (p.id === mine.id ? { ...p, x: pred.x, y: pred.y } : p)),
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 结算后清掉残留的机制播报
  useEffect(() => {
    if (phase !== 'fighting') {
      window.clearTimeout(bannerTimer.current);
      setBanner(null);
    }
  }, [phase]);

  // 开发期调试口：E2E 直接读客户端渲染用的帧，验证输入延迟/平滑度
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).__titan = {
      frame: () => getFrame(),
      myId: () => myRef.current?.clientId ?? '',
    };
  }, [getFrame]);

  // 用快照流判断房主是否真的活着（Presence 心跳在后台会被节流，误报「房主已离开」）
  useEffect(() => {
    const timer = window.setInterval(() => {
      setHostAlive(performance.now() - lastSnapshotAtRef.current < 2600);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // 房主前后台切换：后台走 Worker REST 广播，前台回到 socket
  useEffect(() => {
    const onChange = () => {
      workerRef.current?.postMessage({ type: 'visibility', hidden: document.hidden });
      const me = myRef.current;
      if (!document.hidden && me) {
        // 后台时 Presence 心跳可能被节流，回到前台补一次，避免队友误看到「队长已离开」
        const meta = presenceRef.current.find((p) => p.clientId === me.clientId);
        void connRef.current?.track({
          clientId: me.clientId,
          name: me.name,
          job: me.job,
          host: hostRef.current,
          at: meta?.at ?? Date.now(),
        });
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // 5 秒心跳，顶栏显示延迟
  useEffect(() => {
    if (connState !== 'connected') return;
    const timer = window.setInterval(() => {
      const me = myRef.current;
      if (!me) return;
      void connRef.current?.send('ping', { t: Date.now(), from: me.clientId });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [connState]);

  useEffect(() => {
    return () => {
      window.clearTimeout(bannerTimer.current);
      workerRef.current?.postMessage({ type: 'stop' });
      workerRef.current?.terminate();
      void connRef.current?.leave();
    };
  }, []);

  return {
    env: ENV,
    connState,
    error,
    presence,
    snapshot,
    phase,
    roster: rosterRef.current.length ? rosterRef.current : roster,
    cdcLog,
    cdcCount,
    banner,
    latency,
    fxList,
    hostOnline: hostRef.current ? true : phase === 'lobby' ? presenceHost : hostAlive,
    lastState,
    myJob,
    notice,
    myId: myRef.current?.clientId ?? '',
    isHost: hostRef.current,
    me: snapshot?.players.find((p) => p.id === myRef.current?.clientId) ?? null,
    connect,
    startGame,
    sendMove,
    castSkill,
    getFrame,
  };
}
