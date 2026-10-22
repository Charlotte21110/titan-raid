import {
  ARENA,
  AUTO_REVIVE_SECONDS,
  BOSS,
  ENRAGE_SECONDS,
  FIRST_MECHANIC_AT,
  GAOL_HP,
  GAOL_TIMEOUT,
  JOBS,
  MECHANIC_CYCLE,
  MECHANIC_INTERVAL,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  RAISE_CAST_SECONDS,
} from './constants';
import type {
  BossSnapshot,
  FxEvent,
  GaolSnapshot,
  Job,
  MechanicKind,
  Phase,
  PlayerInput,
  PlayerSnapshot,
  ResultInfo,
  RosterEntry,
  SkillKey,
  Snapshot,
  TelegraphSnapshot,
} from './types';

interface Dot {
  kind: 'thunder' | 'bio';
  remaining: number;
  tick: number;
  perTick: number;
  sourceId: string;
}

interface CastState {
  kind: 'raise';
  targetId: string;
  remaining: number;
  total: number;
}

interface BotState {
  attackAt: number;
  skillAt: number;
  nextThink: number;
  freezeUntil: number;
  dodge: Map<string, boolean>;
  moveTo: { x: number; y: number } | null;
}

interface PlayerState {
  id: string;
  name: string;
  job: Job;
  bot: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  dirX: number;
  dirY: number;
  cd: Record<SkillKey, number>;
  rampageUntil: number;
  mitigationUntil: number;
  dots: Dot[];
  gaoled: boolean;
  reviveIn: number;
  cast: CastState | null;
  damageDealt: number;
  damageTaken: number;
  botState: BotState;
}

interface Telegraph {
  id: string;
  kind: 'circle' | 'line' | 'buster';
  x: number;
  y: number;
  r?: number;
  x2?: number;
  y2?: number;
  w?: number;
  remaining: number;
  total: number;
  mechanic: MechanicKind;
  targetId?: string;
  resolve: () => void;
}

interface GaolState {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  targetId: string;
  targetName: string;
  remaining: number;
}

export interface EngineHooks {
  emit: (type: string, payload: Record<string, unknown>) => void;
  fx: (fx: Omit<FxEvent, 'id'>) => void;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class RaidEngine {
  players = new Map<string, PlayerState>();
  boss = {
    x: BOSS.x,
    y: BOSS.y,
    hp: BOSS.maxHp,
    maxHp: BOSS.maxHp,
    round: 0,
    cast: null as null | {
      mechanic: MechanicKind;
      name: string;
      remaining: number;
      total: number;
      targetId?: string;
    },
    anim: 'idle' as 'idle' | 'attack' | 'death',
    animStart: 0,
  };

  telegraphs: Telegraph[] = [];
  gaols: GaolState[] = [];
  phase: Phase = 'fighting';
  time = 0;
  round = 0;
  mechanicIndex = 0;
  mechanicTimer = FIRST_MECHANIC_AT;
  enrageIn = ENRAGE_SECONDS;
  result?: ResultInfo;
  hooks: EngineHooks;
  private fxSeq = 0;
  private startedAt = 0;

  constructor(roster: RosterEntry[], hooks: EngineHooks) {
    this.hooks = hooks;
    this.startedAt = Date.now();
    const spawn: Record<Job, { x: number; y: number }> = {
      warrior: { x: this.boss.x, y: this.boss.y + 132 },
      white: { x: ARENA.cx - 78, y: this.boss.y + 248 },
      black: { x: ARENA.cx + 78, y: this.boss.y + 248 },
      summoner: { x: ARENA.cx, y: this.boss.y + 296 },
    };
    roster.forEach((entry) => {
      const job = JOBS[entry.job];
      this.players.set(entry.id, {
        id: entry.id,
        name: entry.name,
        job: entry.job,
        bot: entry.bot,
        x: spawn[entry.job].x,
        y: spawn[entry.job].y,
        hp: job.maxHp,
        maxHp: job.maxHp,
        alive: true,
        dirX: 0,
        dirY: 0,
        cd: { j: 0, k: 0, l: 0 },
        rampageUntil: 0,
        mitigationUntil: 0,
        dots: [],
        gaoled: false,
        reviveIn: 0,
        cast: null,
        damageDealt: 0,
        damageTaken: 0,
        botState: {
          attackAt: 0,
          skillAt: 0,
          nextThink: 0,
          freezeUntil: 0,
          dodge: new Map(),
          moveTo: null,
        },
      });
    });
    this.hooks.emit('start', {
      roster: roster.map((r) => ({ name: r.name, job: r.job, bot: r.bot })),
      bossHp: BOSS.maxHp,
      at: Date.now(),
    });
  }

  /** 外部输入：移动 / 技能 */
  applyInput(input: PlayerInput) {
    const player = this.players.get(input.from);
    if (!player || this.phase !== 'fighting') return;
    if (input.kind === 'move') {
      if (!player.alive || player.gaoled || player.cast) {
        player.dirX = 0;
        player.dirY = 0;
        return;
      }
      const len = Math.hypot(input.dx, input.dy) || 1;
      player.dirX = input.dx / len;
      player.dirY = input.dy / len;
    } else {
      this.useSkill(player, input.skill);
    }
  }

  private useSkill(player: PlayerState, key: SkillKey) {
    if (!player.alive || player.gaoled || this.phase !== 'fighting') return;
    if (player.cd[key] > 0) return;
    if (player.cast) return;
    const job = JOBS[player.job];
    if (key === 'j') {
      if (player.job === 'warrior') {
        const d = Math.hypot(player.x - this.boss.x, player.y - this.boss.y);
        if (d > BOSS.hitRadius + 62) return;
      }
      player.cd.j = job.skills.j.cd;
      const base = { warrior: 100, white: 90, black: 130, summoner: 100 }[player.job];
      this.dealDamage(player, base);
      return;
    }
    if (key === 'k') {
      player.cd.k = job.skills.k.cd;
      switch (player.job) {
        case 'warrior':
          player.rampageUntil = this.time + 8;
          this.hooks.fx({ kind: 'cast', x: player.x, y: player.y, text: '狂暴' });
          this.hooks.fx({ kind: 'ring', x: player.x, y: player.y, color: '#ff8a5c' });
          break;
        case 'white': {
          const dead = [...this.players.values()].find((p) => !p.alive);
          if (dead) {
            player.cast = { kind: 'raise', targetId: dead.id, remaining: RAISE_CAST_SECONDS, total: RAISE_CAST_SECONDS };
            this.hooks.fx({ kind: 'cast', x: player.x, y: player.y, text: '复活读条' });
          } else {
            const target = this.lowestAlive();
            if (target) this.heal(target, 350);
          }
          break;
        }
        case 'black':
          this.dealDamage(player, 90);
          break;
        case 'summoner':
          player.dots.push({ kind: 'bio', remaining: 8, tick: 1, perTick: 30, sourceId: player.id });
          this.hooks.fx({ kind: 'cast', x: this.boss.x, y: this.boss.y - 60, text: '毒菌' });
          this.hooks.fx({ kind: 'ring', x: this.boss.x, y: this.boss.y - 8, color: '#9ad64d' });
          break;
      }
      return;
    }
    player.cd.l = job.skills.l.cd;
    switch (player.job) {
      case 'warrior':
        this.heal(player, 300);
        player.mitigationUntil = this.time + 6;
        this.hooks.fx({ kind: 'cast', x: player.x, y: player.y, text: '战栗' });
        this.hooks.fx({ kind: 'ring', x: player.x, y: player.y, color: '#6ec8ff' });
        break;
      case 'white':
        for (const p of this.players.values()) if (p.alive) this.heal(p, 200);
        break;
      case 'black':
        player.dots.push({ kind: 'thunder', remaining: 6, tick: 1, perTick: 40, sourceId: player.id });
        this.hooks.fx({ kind: 'cast', x: this.boss.x, y: this.boss.y - 60, text: '雷霆' });
        this.hooks.fx({ kind: 'ring', x: this.boss.x, y: this.boss.y - 8, color: '#9b8cff' });
        break;
      case 'summoner':
        this.dealDamage(player, 80);
        this.hooks.fx({ kind: 'cast', x: this.boss.x, y: this.boss.y - 60, text: '瘴气' });
        break;
    }
  }

  private lowestAlive(): PlayerState | undefined {
    return [...this.players.values()]
      .filter((p) => p.alive)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  private heal(target: PlayerState, amount: number) {
    if (!target.alive) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const healed = Math.round(target.hp - before);
    if (healed > 0) {
      this.hooks.fx({ kind: 'heal', x: target.x, y: target.y - 28, value: healed });
      this.hooks.fx({ kind: 'ring', x: target.x, y: target.y, color: '#58d68d' });
    }
  }

  private dealDamage(player: PlayerState, base: number) {
    let amount = base;
    if (player.job === 'warrior' && player.rampageUntil > this.time) amount *= 1.5;
    const crit = Math.random() < 0.1;
    if (crit) amount *= 1.5;
    amount = Math.round(amount);

    const gaol = this.gaols[0];
    const onGaol = Boolean(gaol && Math.hypot(player.x - gaol.x, player.y - gaol.y) < 560);
    const targetX = onGaol && gaol ? gaol.x : this.boss.x;
    const targetY = onGaol && gaol ? gaol.y : this.boss.y - 8;
    this.hooks.fx({
      kind: player.job === 'warrior' ? 'slash' : 'bolt',
      x: targetX,
      y: targetY,
      fromX: player.x,
      fromY: player.y,
      color: JOBS[player.job].color,
    });
    if (onGaol && gaol) {
      gaol.hp -= amount;
      player.damageDealt += amount;
      this.hooks.fx({ kind: 'hit', x: gaol.x, y: gaol.y, value: amount, crit });
      if (gaol.hp <= 0) this.breakGaol(gaol);
      return;
    }
    this.boss.hp = Math.max(0, this.boss.hp - amount);
    player.damageDealt += amount;
    this.hooks.fx({ kind: 'hit', x: this.boss.x + rand(-30, 30), y: this.boss.y - 30, value: amount, crit });
    if (this.boss.hp <= 0) this.endRaid('victory', '泰坦被击破');
  }

  tick(rawDt: number) {
    if (this.phase !== 'fighting') return;
    const dt = Math.min(0.05, Math.max(0, rawDt));
    this.time += dt;
    this.enrageIn -= dt;

    for (const p of this.players.values()) {
      for (const key of ['j', 'k', 'l'] as SkillKey[]) p.cd[key] = Math.max(0, p.cd[key] - dt);
      p.dots = p.dots.filter((dot) => {
        dot.remaining -= dt;
        dot.tick -= dt;
        if (dot.tick <= 0 && this.boss.hp > 0) {
          dot.tick += 1;
          this.boss.hp = Math.max(0, this.boss.hp - dot.perTick);
          const source = this.players.get(dot.sourceId);
          if (source) source.damageDealt += dot.perTick;
          this.hooks.fx({ kind: 'hit', x: this.boss.x + rand(-40, 40), y: this.boss.y - 20, value: dot.perTick });
          if (this.boss.hp <= 0) this.endRaid('victory', '泰坦被击破');
        }
        return dot.remaining > 0;
      });

      if (!p.alive) {
        p.reviveIn = Math.max(0, p.reviveIn - dt);
        if (p.reviveIn <= 0) this.revive(p, 0.4);
        continue;
      }

      if (p.cast) {
        p.cast.remaining -= dt;
        if (p.cast.remaining <= 0) {
          const target = this.players.get(p.cast.targetId);
          p.cast = null;
          if (target && !target.alive) this.revive(target, 0.5);
        }
      }

      if (p.gaoled) {
        p.dirX = 0;
        p.dirY = 0;
      } else if (!p.bot) {
        // 人机的位置在 moveBot 里统一推进，这里只动人
        p.x += p.dirX * PLAYER_SPEED * dt;
        p.y += p.dirY * PLAYER_SPEED * dt;
        this.clampToArena(p);
      }

      if (p.bot) this.tickBot(p, dt);
    }

    this.updateBossPosition(dt);

    // 石牢倒计时
    for (const gaol of [...this.gaols]) {
      gaol.remaining -= dt;
      const target = this.players.get(gaol.targetId);
      if (target) {
        gaol.x = target.x;
        gaol.y = target.y;
      }
      if (gaol.remaining <= 0 && target) {
        target.gaoled = false;
        this.gaols = this.gaols.filter((g) => g.id !== gaol.id);
        this.hitPlayer(target, 500 * this.damageMultiplier(), 'granite_gaol');
        this.hooks.emit('damage', {
          mechanic: 'granite_gaol',
          broken: false,
          hits: [{ name: target.name, job: target.job, amount: Math.round(500 * this.damageMultiplier()) }],
          round: this.round,
        });
      }
    }

    // 预警判定
    for (const telegraph of [...this.telegraphs]) {
      telegraph.remaining -= dt;
      if (telegraph.kind === 'buster' && telegraph.targetId) {
        const target = this.players.get(telegraph.targetId);
        if (target) {
          telegraph.x = target.x;
          telegraph.y = target.y;
        }
      }
      if (telegraph.remaining <= 0) {
        telegraph.resolve();
        this.telegraphs = this.telegraphs.filter((t) => t.id !== telegraph.id);
      }
    }

    // Boss 读条
    if (this.boss.cast) {
      this.boss.cast.remaining -= dt;
      if (this.boss.cast.remaining <= 0) {
        const cast = this.boss.cast;
        this.boss.cast = null;
        this.resolveBuster(cast.targetId);
        this.boss.anim = 'attack';
        this.boss.animStart = this.time;
      }
    }

    if (this.enrageIn <= 0) {
      this.enrageIn = 0;
      this.endRaid('wipe', '狂暴读条完成');
      return;
    }

    this.mechanicTimer -= dt;
    if (this.mechanicTimer <= 0) {
      this.startMechanic();
      this.mechanicTimer = MECHANIC_INTERVAL;
    }
  }

  private clampToArena(p: PlayerState) {
    const dx = p.x - ARENA.cx;
    const dy = p.y - ARENA.cy;
    const dist = Math.hypot(dx, dy);
    const max = ARENA.r - PLAYER_RADIUS - 6;
    if (dist > max) {
      p.x = ARENA.cx + (dx / dist) * max;
      p.y = ARENA.cy + (dy / dist) * max;
    }
  }

  /** 坦克拉怪：Boss 追着坦克走，停在近战距离；读条/预警期间定身 */
  private updateBossPosition(dt: number) {
    if (this.boss.cast || this.telegraphs.length > 0) return;
    const tank = [...this.players.values()].find((p) => p.job === 'warrior' && p.alive);
    if (!tank) return;
    const dx = tank.x - this.boss.x;
    const dy = tank.y - this.boss.y;
    const dist = Math.hypot(dx, dy);
    const desired = BOSS.hitRadius + 40;
    if (dist <= desired + 4) return;
    const step = Math.min(dist - desired, 168 * dt);
    this.boss.x += (dx / dist) * step;
    this.boss.y += (dy / dist) * step;
    const limit = ARENA.r - 110;
    const bx = this.boss.x - ARENA.cx;
    const by = this.boss.y - ARENA.cy;
    const bd = Math.hypot(bx, by);
    if (bd > limit) {
      this.boss.x = ARENA.cx + (bx / bd) * limit;
      this.boss.y = ARENA.cy + (by / bd) * limit;
    }
  }

  private damageMultiplier() {
    return 1 + 0.1 * this.round;
  }

  private startMechanic() {
    const kind = MECHANIC_CYCLE[this.mechanicIndex % 4];
    this.round = Math.floor(this.mechanicIndex / 4);
    this.mechanicIndex += 1;
    const mult = this.damageMultiplier();
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (!alive.length) return;

    if (kind === 'mountain_buster') {
      const tank = alive.find((p) => p.job === 'warrior') ?? alive[0];
      this.boss.cast = { mechanic: kind, name: '山崩', remaining: 2, total: 2, targetId: tank.id };
      this.telegraphs.push({
        id: `t-${this.mechanicIndex}`,
        kind: 'buster',
        x: tank.x,
        y: tank.y,
        r: 74,
        remaining: 2,
        total: 2,
        mechanic: kind,
        targetId: tank.id,
        resolve: () => undefined,
      });
      this.hooks.emit('mountain_buster', {
        target: tank.name,
        targetJob: tank.job,
        damage: Math.round(400 * mult),
        round: this.round,
      });
      this.hooks.fx({ kind: 'cast', x: this.boss.x, y: this.boss.y - 80, text: '山崩读条' });
      return;
    }

    if (kind === 'landslide') {
      const target = pick(alive);
      const angle = Math.atan2(target.y - this.boss.y, target.x - this.boss.x);
      // 射线与场地圆的交点，保证落石线不出圈
      const ox = this.boss.x - ARENA.cx;
      const oy = this.boss.y - ARENA.cy;
      const ex = Math.cos(angle);
      const ey = Math.sin(angle);
      const proj = ox * ex + oy * ey;
      const exit = -proj + Math.sqrt(Math.max(0, proj * proj - (ox * ox + oy * oy - ARENA.r * ARENA.r)));
      const length = Math.min(430, Math.max(120, exit - 10));
      const width = 84;
      const x2 = this.boss.x + Math.cos(angle) * length;
      const y2 = this.boss.y + Math.sin(angle) * length;
      this.telegraphs.push({
        id: `t-${this.mechanicIndex}`,
        kind: 'line',
        x: this.boss.x,
        y: this.boss.y,
        x2,
        y2,
        w: width,
        remaining: 2,
        total: 2,
        mechanic: kind,
        resolve: () => {
          const hits = [];
          for (const p of this.players.values()) {
            if (!p.alive) continue;
            if (this.distanceToSegment(p.x, p.y, this.boss.x, this.boss.y, x2, y2) <= width / 2) {
              const dmg = Math.round(300 * mult);
              this.hitPlayer(p, dmg, 'landslide');
              hits.push({ name: p.name, job: p.job, amount: dmg });
            }
          }
          this.hooks.fx({ kind: 'stomp', x: (this.boss.x + x2) / 2, y: (this.boss.y + y2) / 2, text: '落石' });
          this.hooks.emit('damage', { mechanic: 'landslide', hits, round: this.round });
        },
      });
      this.hooks.emit('landslide', { angle: Math.round((angle * 180) / Math.PI), round: this.round });
      return;
    }

    if (kind === 'weight_of_land') {
      const circles: { x: number; y: number }[] = [];
      const first = pick(alive);
      circles.push({
        x: Math.max(ARENA.cx - ARENA.r + 90, Math.min(ARENA.cx + ARENA.r - 90, first.x + rand(-40, 40))),
        y: Math.max(ARENA.cy - ARENA.r + 90, Math.min(ARENA.cy + ARENA.r - 90, first.y + rand(-40, 40))),
      });
      let guard = 0;
      while (circles.length < 4 && guard < 80) {
        guard += 1;
        const angle = rand(0, Math.PI * 2);
        const dist = rand(40, ARENA.r - 80);
        const x = ARENA.cx + Math.cos(angle) * dist;
        const y = ARENA.cy + Math.sin(angle) * dist;
        if (circles.every((c) => Math.hypot(c.x - x, c.y - y) > 95)) circles.push({ x, y });
      }
      circles.forEach((circle, index) => {
        this.telegraphs.push({
          id: `t-${this.mechanicIndex}-${index}`,
          kind: 'circle',
          x: circle.x,
          y: circle.y,
          r: 60,
          remaining: 1.5,
          total: 1.5,
          mechanic: kind,
          resolve: () => undefined,
        });
      });
      this.telegraphs.push({
        id: `t-${this.mechanicIndex}-stomp`,
        kind: 'circle',
        x: ARENA.cx,
        y: ARENA.cy,
        r: ARENA.r,
        remaining: 1.5,
        total: 1.5,
        mechanic: kind,
        resolve: () => {
          const hits = [];
          for (const p of this.players.values()) {
            if (!p.alive) continue;
            let dmg = Math.round(150 * mult);
            if (circles.some((c) => Math.hypot(p.x - c.x, p.y - c.y) <= 60)) dmg += Math.round(250 * mult);
            this.hitPlayer(p, dmg, 'weight_of_land');
            hits.push({ name: p.name, job: p.job, amount: dmg });
          }
          this.hooks.fx({ kind: 'stomp', x: ARENA.cx, y: ARENA.cy, text: '大地之重' });
          this.hooks.emit('damage', { mechanic: 'weight_of_land', hits, round: this.round });
        },
      });
      this.hooks.emit('weight_of_land', { circles, damage: Math.round(250 * mult), stomp: Math.round(150 * mult), round: this.round });
      return;
    }

    const candidates = alive.filter((p) => p.job !== 'warrior');
    const target = candidates.length ? pick(candidates) : pick(alive);
    const gaol: GaolState = {
      id: `g-${this.mechanicIndex}`,
      x: target.x,
      y: target.y,
      hp: GAOL_HP,
      maxHp: GAOL_HP,
      targetId: target.id,
      targetName: target.name,
      remaining: GAOL_TIMEOUT,
    };
    this.gaols.push(gaol);
    target.gaoled = true;
    target.dirX = 0;
    target.dirY = 0;
    this.hooks.emit('granite_gaol', {
      target: target.name,
      targetJob: target.job,
      hp: GAOL_HP,
      timeout: GAOL_TIMEOUT,
      round: this.round,
    });
    this.hooks.fx({ kind: 'cast', x: target.x, y: target.y, text: '石牢！' });
  }

  private resolveBuster(targetId?: string) {
    const target = targetId ? this.players.get(targetId) : undefined;
    if (!target || !target.alive) return;
    const mult = this.damageMultiplier();
    const dmg = Math.round(400 * mult);
    this.hitPlayer(target, dmg, 'mountain_buster');
    this.hooks.emit('damage', {
      mechanic: 'mountain_buster',
      hits: [{ name: target.name, job: target.job, amount: dmg }],
      round: this.round,
    });
    this.hooks.fx({ kind: 'stomp', x: target.x, y: target.y, text: '山崩' });
  }

  private hitPlayer(p: PlayerState, amount: number, source: string) {
    if (!p.alive) return;
    let dmg = amount;
    if (p.job === 'warrior' && p.mitigationUntil > this.time) dmg *= 0.5;
    dmg = Math.round(dmg);
    p.hp -= dmg;
    p.damageTaken += dmg;
    this.hooks.fx({ kind: 'hit', x: p.x, y: p.y - 30, value: dmg });
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.reviveIn = AUTO_REVIVE_SECONDS;
      p.gaoled = false;
      p.cast = null;
      p.dirX = 0;
      p.dirY = 0;
      this.hooks.fx({ kind: 'death', x: p.x, y: p.y });
      this.hooks.emit('death', { name: p.name, job: p.job, source, round: this.round });
      if ([...this.players.values()].every((x) => !x.alive)) {
        this.endRaid('wipe', '全员倒地');
      }
    }
  }

  private revive(p: PlayerState, hpPct: number) {
    this.hooks.fx({ kind: 'ring', x: p.x, y: p.y, color: '#ffd84d' });
    p.alive = true;
    p.hp = Math.round(p.maxHp * hpPct);
    p.reviveIn = 0;
    p.gaoled = false;
    p.cast = null;
    this.hooks.fx({ kind: 'heal', x: p.x, y: p.y - 30, text: '复活' });
  }

  private breakGaol(gaol: GaolState) {
    const target = this.players.get(gaol.targetId);
    if (target) target.gaoled = false;
    this.gaols = this.gaols.filter((g) => g.id !== gaol.id);
    this.hooks.fx({ kind: 'gaol-break', x: gaol.x, y: gaol.y, text: '石牢破碎' });
    this.hooks.emit('damage', {
      mechanic: 'granite_gaol',
      broken: true,
      hits: [],
      target: gaol.targetName,
      round: this.round,
    });
  }

  private endRaid(outcome: 'victory' | 'wipe', reason: string) {
    if (this.phase !== 'fighting') return;
    this.phase = outcome;
    this.telegraphs = [];
    this.gaols.forEach((g) => {
      const t = this.players.get(g.targetId);
      if (t) t.gaoled = false;
    });
    this.gaols = [];
    this.boss.cast = null;
    if (outcome === 'victory') {
      this.boss.anim = 'death';
      this.boss.animStart = this.time;
    }
    const dps = [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, job: p.job, bot: p.bot, damage: Math.round(p.damageDealt) }))
      .sort((a, b) => b.damage - a.damage);
    this.result = { outcome, reason, duration: Math.round((Date.now() - this.startedAt) / 1000), dps };
    this.hooks.emit(outcome, { reason, duration: this.result.duration, dps, round: this.round });
  }

  // ---------------- Bot ----------------

  private tickBot(p: PlayerState, dt: number) {
    const bot = p.botState;
    if (this.time < bot.nextThink) {
      this.moveBot(p, dt);
      return;
    }
    bot.nextThink = this.time + 0.25;

    if (!p.alive || p.gaoled || p.cast) {
      p.dirX = 0;
      p.dirY = 0;
      return;
    }

    // 躲预警：每个预警只掷一次骰子
    let danger: { x: number; y: number } | null = null;
    for (const t of this.telegraphs) {
      if (t.mechanic === 'weight_of_land' && t.r === ARENA.r) continue;
      const inside =
        t.kind === 'circle'
          ? Math.hypot(p.x - t.x, p.y - t.y) <= (t.r ?? 0) + 12
          : t.kind === 'line'
            ? this.distanceToSegment(p.x, p.y, t.x, t.y, t.x2 ?? t.x, t.y2 ?? t.y) <= (t.w ?? 0) / 2 + 12
            : Math.hypot(p.x - t.x, p.y - t.y) <= (t.r ?? 0) + 8;
      if (!inside) continue;
      if (!bot.dodge.has(t.id)) {
        const ok = Math.random() < 0.9;
        bot.dodge.set(t.id, ok);
        if (!ok) continue;
        if (Math.random() < 0.2) {
          bot.freezeUntil = this.time + 1;
          continue;
        }
      }
      if (!bot.dodge.get(t.id) || this.time < bot.freezeUntil) continue;
      danger = this.escapePoint(p, t);
      break;
    }

    if (danger) {
      bot.moveTo = danger;
    } else {
      bot.moveTo = this.jobPosition(p);
    }
    this.moveBot(p, dt);

    if (this.time >= bot.attackAt) {
      const inRange = p.job !== 'warrior' || Math.hypot(p.x - this.boss.x, p.y - this.boss.y) <= BOSS.hitRadius + 62;
      if (inRange) {
        bot.attackAt = this.time + JOBS[p.job].skills.j.cd;
        this.useSkill(p, 'j');
      }
    }
    if (this.time >= bot.skillAt) {
      bot.skillAt = this.time + 1.1;
      const hpPct = p.hp / p.maxHp;
      if (p.job === 'warrior' && hpPct < 0.55) this.useSkill(p, 'l');
      else this.useSkill(p, 'k');
      if (p.job === 'white') {
        const hurt = [...this.players.values()].filter((q) => q.alive && q.hp / q.maxHp < 0.72).length;
        if (hurt >= 2) this.useSkill(p, 'l');
      } else {
        this.useSkill(p, 'l');
      }
    }
  }

  private moveBot(p: PlayerState, dt: number) {
    const target = p.botState.moveTo;
    if (!target) {
      p.dirX = 0;
      p.dirY = 0;
      return;
    }
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      p.dirX = 0;
      p.dirY = 0;
      return;
    }
    p.dirX = dx / dist;
    p.dirY = dy / dist;
    p.x += p.dirX * PLAYER_SPEED * 0.92 * dt;
    p.y += p.dirY * PLAYER_SPEED * 0.92 * dt;
    this.clampToArena(p);
  }

  private jobPosition(p: PlayerState): { x: number; y: number } {
    const index = ['warrior', 'white', 'black', 'summoner'].indexOf(p.job);
    // 站位略小于 Boss 的停步距离，避免「坦克追 Boss、Boss 追坦克」的死循环
    if (p.job === 'warrior') return { x: this.boss.x + Math.sin(this.time * 0.6) * 20, y: this.boss.y + 116 };
    if (p.job === 'white') return { x: this.boss.x - 172, y: this.boss.y + 246 };
    const angle = this.time * 0.22 + (index * Math.PI) / 2;
    return { x: this.boss.x + Math.cos(angle) * 212, y: this.boss.y + 176 + Math.sin(angle) * 52 };
  }

  private escapePoint(p: PlayerState, t: Telegraph): { x: number; y: number } {
    if (t.kind === 'circle') {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const dist = Math.hypot(dx, dy) || 1;
      const need = (t.r ?? 60) + 55;
      return { x: t.x + (dx / dist) * need, y: t.y + (dy / dist) * need };
    }
    if (t.kind === 'line') {
      const x2 = t.x2 ?? t.x;
      const y2 = t.y2 ?? t.y;
      const vx = x2 - t.x;
      const vy = y2 - t.y;
      const len2 = vx * vx + vy * vy || 1;
      let u = ((p.x - t.x) * vx + (p.y - t.y) * vy) / len2;
      u = Math.max(0, Math.min(1, u));
      const px = t.x + vx * u;
      const py = t.y + vy * u;
      const nx = p.x - px;
      const ny = p.y - py;
      const nl = Math.hypot(nx, ny) || 1;
      const side = nl < 1 ? 1 : Math.sign(nx * vy - ny * vx || 1);
      const off = (t.w ?? 80) / 2 + 55;
      return { x: p.x + (-vy / Math.sqrt(len2)) * off * side, y: p.y + (vx / Math.sqrt(len2)) * off * side };
    }
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const dist = Math.hypot(dx, dy) || 1;
    return { x: t.x + (dx / dist) * 160, y: t.y + (dy / dist) * 160 };
  }

  distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const len2 = vx * vx + vy * vy || 1;
    let u = ((px - x1) * vx + (py - y1) * vy) / len2;
    u = Math.max(0, Math.min(1, u));
    const cx = x1 + vx * u;
    const cy = y1 + vy * u;
    return Math.hypot(px - cx, py - cy);
  }

  // ---------------- Snapshot ----------------

  snapshot(): Snapshot {
    const players: PlayerSnapshot[] = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      job: p.job,
      bot: p.bot,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      hp: Math.round(p.hp),
      maxHp: p.maxHp,
      alive: p.alive,
      gaoled: p.gaoled,
      reviveIn: Math.round(p.reviveIn),
      cd: { j: Math.round(p.cd.j * 10) / 10, k: Math.round(p.cd.k * 10) / 10, l: Math.round(p.cd.l * 10) / 10 },
      rampage: Math.max(0, Math.round((p.rampageUntil - this.time) * 10) / 10),
      mitigation: Math.max(0, Math.round((p.mitigationUntil - this.time) * 10) / 10),
      damageDealt: Math.round(p.damageDealt),
      damageTaken: Math.round(p.damageTaken),
    }));

    const anim =
      this.boss.anim === 'attack' && this.time - this.boss.animStart > 1.15 ? ('idle' as const) : this.boss.anim;
    const boss: BossSnapshot = {
      x: Math.round(this.boss.x * 10) / 10,
      y: Math.round(this.boss.y * 10) / 10,
      hp: Math.round(this.boss.hp),
      maxHp: this.boss.maxHp,
      round: this.round + 1,
      anim,
      animT: Math.max(0, this.time - this.boss.animStart),
      cast: this.boss.cast
        ? {
            mechanic: this.boss.cast.mechanic,
            name: this.boss.cast.name,
            remaining: Math.max(0, Math.round(this.boss.cast.remaining * 10) / 10),
            total: this.boss.cast.total,
            targetId: this.boss.cast.targetId,
          }
        : undefined,
      enrageIn: Math.max(0, Math.round(this.enrageIn)),
    };

    const telegraphs: TelegraphSnapshot[] = this.telegraphs.map((t) => ({
      id: t.id,
      kind: t.kind,
      x: t.x,
      y: t.y,
      r: t.r,
      x2: t.x2,
      y2: t.y2,
      w: t.w,
      remaining: Math.max(0, Math.round(t.remaining * 100) / 100),
      total: t.total,
      mechanic: t.mechanic,
    }));

    const gaols: GaolSnapshot[] = this.gaols.map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      hp: Math.max(0, Math.round(g.hp)),
      maxHp: g.maxHp,
      targetId: g.targetId,
      targetName: g.targetName,
      remaining: Math.max(0, Math.round(g.remaining * 10) / 10),
    }));

    return {
      ts: Date.now(),
      elapsed: Math.round(this.time),
      phase: this.phase,
      round: this.round + 1,
      players,
      boss,
      gaols,
      telegraphs,
      result: this.result,
    };
  }
}
