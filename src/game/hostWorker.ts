import { RaidEngine } from './engine';
import type { PlayerInput, RosterEntry } from './types';

/**
 * 房主模拟跑在 Worker 里：Chrome 会把后台标签页的 setInterval 节流到 1s 左右，
 * 但 Worker 的定时器不受页面节流影响（切后台 6 秒：主线程只跑了 12 tick，Worker 跑了 509 tick）。
 * 这里只算逻辑，快照/事件通过 postMessage 交给主线程广播和写库。
 */
let engine: RaidEngine | null = null;
let timer = 0;
let last = 0;
let lastFrame = 0;
let lastSnap = 0;
let lastState = 0;
let lastPhase = 'fighting';
let speed = 1;
let room = 'raid:main';
let httpUrl = '';
let httpKey = '';
let sending = false;
let aborter: AbortController | null = null;
let hidden = false;

const post = (message: any) => (self as any).postMessage(message);

function stateRow(snap: ReturnType<RaidEngine['snapshot']>) {
  return {
    boss_hp: Math.max(0, Math.round(snap.boss.hp)),
    boss_hp_max: snap.boss.maxHp,
    phase: snap.phase,
    round: snap.round,
    updated_at: new Date().toISOString(),
  };
}

function sendSnapshotOverHttp(snap: ReturnType<RaidEngine['snapshot']>) {
  if (!httpUrl || sending) return;
  sending = true;
  const controller = new AbortController();
  aborter = controller;
  fetch(httpUrl, {
    method: 'POST',
    headers: { apikey: httpKey, Authorization: `Bearer ${httpKey}`, 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({ messages: [{ topic: room, event: 'snapshot', payload: snap, private: false }] }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    })
    .catch((error) => {
      if ((error as Error)?.name === 'AbortError') return;
      // HTTP 失败时退回主线程 socket 广播（可能被节流，但不会完全断流）
      post({ type: 'snapshot-fallback', snapshot: snap, message: String(error) });
    })
    .finally(() => {
      sending = false;
      aborter = null;
    });
}

function tick() {
  if (!engine) return;
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  engine.tick(dt * speed);
  const snap = engine.snapshot();

  if (!hidden && now - lastFrame >= 16) {
    lastFrame = now;
    post({ type: 'frame', snapshot: snap });
  }
  if (now - lastSnap >= 50) {
    lastSnap = now;
    // 前台走 socket（20Hz），后台走 Worker 内的 REST（主线程 socket 会被节流）
    if (hidden) sendSnapshotOverHttp(snap);
    else post({ type: 'snapshot-broadcast', snapshot: snap });
    post({ type: 'snapshot', snapshot: snap });
  }
  if (now - lastState >= 2000) {
    lastState = now;
    post({ type: 'state', row: stateRow(snap) });
  }
  if (snap.phase !== lastPhase) {
    lastPhase = snap.phase;
    if (hidden) sendSnapshotOverHttp(snap);
    else post({ type: 'snapshot-broadcast', snapshot: snap });
    post({ type: 'snapshot', snapshot: snap });
    post({ type: 'state', row: stateRow(snap) });
  }
}

function start(roster: RosterEntry[], nextSpeed = 1) {
  speed = nextSpeed;
  engine = new RaidEngine(roster, {
    emit: (eventType, payload) => post({ type: 'event', eventType, payload }),
    fx: (fx) => post({ type: 'fx', fx }),
  });
  last = performance.now();
  lastFrame = 0;
  lastSnap = 0;
  lastState = 0;
  lastPhase = 'fighting';
  if (timer) (self as any).clearInterval(timer);
  timer = (self as any).setInterval(tick, 16);
}

self.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (!message) return;
  if (message.type === 'start') {
    room = String(message.room || 'raid:main');
    httpUrl = `https://${message.env}.api.tcloudbasegateway.com/v1/realtime/api/broadcast`;
    httpKey = String(message.accessKey || '');
    start(message.roster as RosterEntry[], Number(message.speed) || 1);
    return;
  }
  if (message.type === 'visibility') {
    hidden = Boolean(message.hidden);
    return;
  }
  if (message.type === 'input' && engine) {
    engine.applyInput(message.input as PlayerInput);
    return;
  }
  if (message.type === 'stop') {
    if (timer) (self as any).clearInterval(timer);
    timer = 0;
    engine = null;
    aborter?.abort();
    aborter = null;
  }
};
