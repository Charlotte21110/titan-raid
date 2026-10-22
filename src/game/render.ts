import { ARENA, BOSS, JOBS } from './constants';
import type { FxEvent, GaolSnapshot, Snapshot, TelegraphSnapshot } from './types';

export interface RenderAssets {
  idle?: HTMLImageElement;
  attack?: HTMLImageElement;
  death?: HTMLImageElement;
  tiles?: HTMLImageElement;
}

export interface FxParticle extends FxEvent {
  born: number;
  life: number;
}

const INK = '#17212b';
const PAPER = '#fffdf3';

// 固定种子，避免每帧抖动
let seed = 20261019;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const SAND = Array.from({ length: 220 }, () => {
  const angle = rnd() * Math.PI * 2;
  const dist = Math.sqrt(rnd()) * ARENA.r;
  return {
    x: ARENA.cx + Math.cos(angle) * dist,
    y: ARENA.cy + Math.sin(angle) * dist,
    r: 0.8 + rnd() * 1.8,
    a: 0.05 + rnd() * 0.1,
  };
});
const ROCKS = Array.from({ length: 16 }, () => {
  const angle = rnd() * Math.PI * 2;
  const dist = ARENA.r * (0.5 + rnd() * 0.42);
  return {
    x: ARENA.cx + Math.cos(angle) * dist,
    y: ARENA.cy + Math.sin(angle) * dist,
    cell: Math.floor(rnd() * 12),
    size: 26 + rnd() * 20,
    rot: (rnd() - 0.5) * 0.8,
    alpha: 0.18 + rnd() * 0.16,
  };
});

const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, "PingFang SC", monospace';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBossFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | undefined,
  anim: 'idle' | 'attack' | 'death',
  animT: number,
  bx: number,
  by: number,
) {
  if (!img || !img.complete) return;
  const size = 300;
  const x = bx - size / 2;
  const y = by - size / 2 + 2;
  let cols = 2;
  let rows = 3;
  let frames = 5;
  let fps = 6;
  let loop = true;
  let frame = 0;
  if (anim === 'attack') {
    cols = 5;
    rows = 5;
    frames = 25;
    fps = 16;
    loop = false;
    frame = Math.min(frames - 1, Math.floor(animT * fps));
  } else if (anim === 'death') {
    cols = 3;
    rows = 4;
    frames = 12;
    fps = 9;
    loop = false;
    frame = Math.min(frames - 1, Math.floor(animT * fps));
  } else {
    const raw = Math.floor((performance.now() / 1000) * fps);
    frame = loop ? raw % frames : Math.min(frames - 1, raw);
  }
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const cellW = img.width / cols;
  const cellH = img.height / rows;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, x, y, size, size);
}

function drawBossPlate(ctx: CanvasRenderingContext2D, hp: number, maxHp: number, bx: number, by: number) {
  const label = `泰坦 · TITAN  ${Math.max(0, Math.round((hp / maxHp) * 100))}%`;
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(label).width + 20;
  const x = bx - width / 2;
  const y = by - 116;
  ctx.fillStyle = INK;
  roundRect(ctx, x, y, width, 20, 3);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.fillText(label, bx, y + 10.5);
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  snap: Snapshot | null,
  assets: RenderAssets,
  particles: FxParticle[],
  opts: { myId?: string; shake?: number; viewport?: { width: number; height: number } },
) {
  const now = performance.now();
  const shake = opts.shake ?? 0;
  const bossX = snap?.boss.x ?? BOSS.x;
  const bossY = snap?.boss.y ?? BOSS.y;
  const vw = opts.viewport?.width ?? ARENA.width;
  const vh = opts.viewport?.height ?? ARENA.height;
  ctx.save();
  // 逻辑坐标 960x660 映射到实际缓冲（含 DPR），否则 Retina 上只画左上角
  ctx.setTransform(vw / ARENA.width, 0, 0, vh / ARENA.height, 0, 0);
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  // 背景 + 网格
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.strokeStyle = 'rgba(23,33,43,0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x < ARENA.width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA.height);
    ctx.stroke();
  }
  for (let y = 0; y < ARENA.height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA.width, y);
    ctx.stroke();
  }

  // 场地硬阴影
  ctx.beginPath();
  ctx.arc(ARENA.cx + 7, ARENA.cy + 8, ARENA.r, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();

  // 沙地
  const grad = ctx.createRadialGradient(ARENA.cx, ARENA.cy - 40, 30, ARENA.cx, ARENA.cy, ARENA.r);
  grad.addColorStop(0, '#fbf0d2');
  grad.addColorStop(0.7, '#f3e3ba');
  grad.addColorStop(1, '#e9d3a2');
  ctx.beginPath();
  ctx.arc(ARENA.cx, ARENA.cy, ARENA.r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  ctx.clip();

  for (const dot of SAND) {
    ctx.globalAlpha = dot.a;
    ctx.fillStyle = '#8a6b35';
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 地砖素材当碎石装饰
  if (assets.tiles?.complete) {
    const cell = 32;
    for (const rock of ROCKS) {
      const col = rock.cell % 16;
      const row = Math.floor(rock.cell / 16) % 4;
      ctx.save();
      ctx.globalAlpha = rock.alpha;
      ctx.translate(rock.x, rock.y);
      ctx.rotate(rock.rot);
      ctx.drawImage(assets.tiles, col * cell, row * cell, cell, cell, -rock.size / 2, -rock.size / 2, rock.size, rock.size);
      ctx.restore();
    }
  }
  ctx.restore();

  // 场地边框 + 内圈
  ctx.beginPath();
  ctx.arc(ARENA.cx, ARENA.cy, ARENA.r, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ARENA.cx, ARENA.cy, ARENA.r - 16, 0, Math.PI * 2);
  ctx.setLineDash([10, 9]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(23,33,43,0.16)';
  ctx.stroke();
  ctx.setLineDash([]);

  // Boss 阴影
  ctx.beginPath();
  ctx.ellipse(bossX, bossY + 92, 92, 22, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(23,33,43,0.16)';
  ctx.fill();

  if (!snap) {
    drawBossFrame(ctx, assets.idle, 'idle', 0, bossX, bossY);
    drawBossPlate(ctx, 24000, 24000, bossX, bossY);
    ctx.restore();
    return;
  }

  // 预警画在地面，压在本体之下
  for (const t of snap.telegraphs) drawTelegraph(ctx, t, now, snap.boss.x, snap.boss.y);

  drawBossFrame(
    ctx,
    snap.boss.anim === 'idle' ? assets.idle : snap.boss.anim === 'attack' ? assets.attack : assets.death,
    snap.boss.anim,
    snap.boss.animT,
    snap.boss.x,
    snap.boss.y,
  );
  drawBossPlate(ctx, snap.boss.hp, snap.boss.maxHp, snap.boss.x, snap.boss.y);

  // 石牢
  for (const g of snap.gaols) drawGaol(ctx, g);

  // 玩家
  const sorted = [...snap.players].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    const job = JOBS[p.job];
    const isMe = p.id === opts.myId;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 19, 20, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(23,33,43,0.16)';
    ctx.fill();

    ctx.save();
    if (!p.alive) ctx.globalAlpha = 0.45;
    ctx.translate(p.x, p.y);
    if (isMe) {
      ctx.beginPath();
      ctx.arc(0, 0, 27, 0, Math.PI * 2);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 硬阴影 + 方块本体
    ctx.fillStyle = INK;
    roundRect(ctx, -16, -14 + 4, 32, 32, 5);
    ctx.fill();
    ctx.fillStyle = p.alive ? job.color : '#9aa3ad';
    roundRect(ctx, -16, -16, 32, 32, 5);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `700 15px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(job.short, 0, 1);
    ctx.restore();

    // 名字
    const label = p.bot ? p.name.replace('亲信战友·', '') : p.name;
    ctx.font = `600 11px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = isMe ? '#ffd84d' : PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    roundRect(ctx, p.x - w / 2, p.y - 46, w, 16, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.fillText(label, p.x, p.y - 34);

    // HP 条
    const barW = 44;
    ctx.fillStyle = INK;
    roundRect(ctx, p.x - barW / 2 - 1, p.y + 21, barW + 2, 8, 2);
    ctx.fill();
    const pct = p.alive ? Math.max(0, p.hp / p.maxHp) : 0;
    ctx.fillStyle = pct > 0.55 ? '#58d68d' : pct > 0.25 ? '#ffd84d' : '#ff6b6b';
    roundRect(ctx, p.x - barW / 2, p.y + 22, Math.max(0, barW * pct), 6, 1);
    ctx.fill();

    if (!p.alive) {
      ctx.font = `700 10px ${FONT_STACK}`;
      ctx.fillStyle = '#b3261e';
      ctx.fillText(`倒地 ${p.reviveIn}s`, p.x, p.y + 44);
    } else if (p.gaoled) {
      ctx.font = `700 10px ${FONT_STACK}`;
      ctx.fillStyle = '#8a5a00';
      ctx.fillText('石牢中', p.x, p.y + 44);
    }
  }

  // Boss 读条
  if (snap.boss.cast && snap.phase === 'fighting') {
    const cast = snap.boss.cast;
    drawCastBar(ctx, snap.boss.x, snap.boss.y - 150, 220, `山崩 · ${cast.remaining.toFixed(1)}s`, 1 - cast.remaining / cast.total);
  }

  // 技能特效：斩击 / 弹道 / 光环
  for (const p of particles) {
    if (p.kind === 'slash') drawSlash(ctx, p, now);
    else if (p.kind === 'bolt') drawBolt(ctx, p, now);
    else if (p.kind === 'ring') drawRing(ctx, p, now);
  }

  // 浮动数字
  for (const p of particles) {
    if (p.kind === 'slash' || p.kind === 'bolt' || p.kind === 'ring') continue;
    const age = (now - p.born) / p.life;
    if (age < 0 || age > 1) continue;
    const alpha = 1 - age * age;
    const y = p.y - 26 - age * 34;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (p.kind === 'hit') {
      const text = `${p.value ?? 0}`;
      ctx.font = `800 ${p.crit ? 26 : 20}px ${FONT_STACK}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fffdf3';
      ctx.strokeText(text, p.x, y);
      ctx.fillStyle = p.crit ? '#ff3b30' : '#e8590c';
      ctx.fillText(text, p.x, y);
    } else if (p.kind === 'heal') {
      ctx.font = `800 16px ${FONT_STACK}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fffdf3';
      const text = p.text ? p.text : `+${p.value ?? 0}`;
      ctx.strokeText(text, p.x, y);
      ctx.fillStyle = '#0f7b4f';
      ctx.fillText(text, p.x, y);
    } else {
      ctx.font = `800 15px ${FONT_STACK}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fffdf3';
      const text = p.text || (p.kind === 'death' ? '倒地' : p.kind === 'gaol-break' ? '石牢破碎' : '');
      ctx.strokeText(text, p.x, y);
      ctx.fillStyle = p.kind === 'death' ? '#b3261e' : p.kind === 'gaol-break' ? '#b8860b' : INK;
      ctx.fillText(text, p.x, y);
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawSlash(ctx: CanvasRenderingContext2D, p: FxParticle, now: number) {
  const age = Math.min(1, (now - p.born) / p.life);
  const fromX = p.fromX ?? p.x - 40;
  const fromY = p.fromY ?? p.y;
  const angle = Math.atan2(p.y - fromY, p.x - fromX);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.globalAlpha = 1 - age;
  ctx.strokeStyle = p.color || '#fffdf3';
  ctx.lineWidth = 6 - age * 3;
  ctx.beginPath();
  ctx.arc(0, 0, 30 + age * 8, -1.15, 1.15);
  ctx.stroke();
  ctx.strokeStyle = '#fffdf3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 30 + age * 8, -0.95, 0.95);
  ctx.stroke();
  ctx.restore();
}

function drawBolt(ctx: CanvasRenderingContext2D, p: FxParticle, now: number) {
  const age = Math.min(1, (now - p.born) / p.life);
  const fromX = p.fromX ?? p.x - 60;
  const fromY = p.fromY ?? p.y;
  const mx = (fromX + p.x) / 2 + (Math.random() - 0.5) * 10;
  const my = (fromY + p.y) / 2 + (Math.random() - 0.5) * 10;
  ctx.save();
  ctx.globalAlpha = 1 - age;
  ctx.strokeStyle = p.color || '#ffd84d';
  ctx.lineWidth = 4 - age * 2;
  ctx.shadowColor = p.color || '#ffd84d';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(mx, my);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 16 * (1 - age) + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRing(ctx: CanvasRenderingContext2D, p: FxParticle, now: number) {
  const age = Math.min(1, (now - p.born) / p.life);
  const radius = 12 + age * 42;
  ctx.save();
  ctx.globalAlpha = 1 - age;
  ctx.strokeStyle = p.color || '#ffd84d';
  ctx.lineWidth = 4 - age * 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = (1 - age) * 0.2;
  ctx.fillStyle = p.color || '#ffd84d';
  ctx.fill();
  ctx.restore();
}

function drawTelegraph(ctx: CanvasRenderingContext2D, t: TelegraphSnapshot, now: number, bossX: number, bossY: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 90);
  if (t.kind === 'line') {
    const x2 = t.x2 ?? t.x;
    const y2 = t.y2 ?? t.y;
    const angle = Math.atan2(y2 - t.y, x2 - t.x);
    const len = Math.hypot(x2 - t.x, y2 - t.y);
    const w = t.w ?? 80;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(255,92,92,${0.16 + pulse * 0.1})`;
    ctx.fillRect(0, -w / 2, len, w);
    ctx.strokeStyle = '#d92b2b';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(0, -w / 2, len, w);
    ctx.setLineDash([]);
    // 箭头
    ctx.fillStyle = 'rgba(217,43,43,0.55)';
    for (let d = 60; d < len - 20; d += 70) {
      ctx.beginPath();
      ctx.moveTo(d, -w / 2 + 8);
      ctx.lineTo(d + 18, 0);
      ctx.lineTo(d, w / 2 - 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (t.kind === 'buster') {
    const r = t.r ?? 74;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bossX, bossY);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = 'rgba(255,92,92,0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,92,92,${0.2 + pulse * 0.12})`;
    ctx.fill();
    ctx.strokeStyle = '#d92b2b';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 十字
    ctx.beginPath();
    ctx.moveTo(t.x - r * 0.55, t.y);
    ctx.lineTo(t.x + r * 0.55, t.y);
    ctx.moveTo(t.x, t.y - r * 0.55);
    ctx.lineTo(t.x, t.y + r * 0.55);
    ctx.strokeStyle = 'rgba(217,43,43,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (t.r && t.r >= ARENA.r - 2) return; // 全屏跺脚由地面闪红表示
  const r = t.r ?? 60;
  ctx.beginPath();
  ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,92,92,${0.14 + pulse * 0.1})`;
  ctx.fill();
  ctx.strokeStyle = '#d92b2b';
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 7]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(t.x, t.y, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(217,43,43,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawGaol(ctx: CanvasRenderingContext2D, g: GaolSnapshot) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 - Math.PI / 8;
    const r = i % 2 === 0 ? 40 : 34;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,207,77,0.55)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a5a00';
  ctx.stroke();

  // 裂纹
  ctx.strokeStyle = 'rgba(90,60,0,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i + 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * 26, Math.sin(angle) * 26);
    ctx.stroke();
  }
  ctx.restore();

  const pct = Math.max(0, g.hp / g.maxHp);
  ctx.fillStyle = INK;
  roundRect(ctx, g.x - 32, g.y - 62, 64, 9, 2);
  ctx.fill();
  ctx.fillStyle = '#ffcf4d';
  roundRect(ctx, g.x - 31, g.y - 61, 62 * pct, 7, 1);
  ctx.fill();
  ctx.font = `700 10px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a3c00';
  ctx.fillText(`石牢 ${Math.ceil(g.hp)} · ${g.remaining.toFixed(1)}s`, g.x, g.y - 68);
}

function drawCastBar(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, label: string, pct: number) {
  ctx.save();
  ctx.fillStyle = INK;
  roundRect(ctx, cx - w / 2 - 2, y - 2, w + 4, 20, 3);
  ctx.fill();
  ctx.fillStyle = '#fffdf3';
  roundRect(ctx, cx - w / 2, y, w, 16, 2);
  ctx.fill();
  ctx.fillStyle = '#ff8a5c';
  roundRect(ctx, cx - w / 2, y, Math.max(2, w * Math.max(0, Math.min(1, pct))), 16, 2);
  ctx.fill();
  ctx.font = `700 11px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.fillText(label, cx, y + 9);
  ctx.restore();
}

