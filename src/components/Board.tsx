import { useEffect, useRef, type ReactNode } from 'react';
import { ARENA } from '../game/constants';
import { drawScene, type FxParticle, type RenderAssets } from '../game/render';
import type { FxEvent, Phase, SkillKey, Snapshot } from '../game/types';

interface Props {
  getFrame: () => Snapshot | null;
  fxList: FxEvent[];
  myId: string;
  phase: Phase;
  onMove: (dx: number, dy: number) => void;
  onCast: (skill: SkillKey) => void;
  overlay?: ReactNode;
}

const LIFE: Record<string, number> = {
  hit: 820,
  heal: 900,
  cast: 950,
  death: 1300,
  'gaol-break': 1100,
  stomp: 900,
  slash: 260,
  bolt: 240,
  ring: 420,
};

export function Board({ getFrame, fxList, myId, phase, onMove, onCast, overlay }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assetsRef = useRef<RenderAssets>({});
  const particlesRef = useRef<FxParticle[]>([]);
  const shakeRef = useRef(0);
  const lastFxRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // 素材预加载
  useEffect(() => {
    const load = (src: string) => {
      const image = new Image();
      image.src = src;
      return image;
    };
    assetsRef.current = {
      idle: load('/assets/idle.png'),
      attack: load('/assets/attack.png'),
      death: load('/assets/death.png'),
      tiles: load('/assets/tileset_cave_01.png'),
    };
  }, []);

  // FX 入队
  useEffect(() => {
    for (const fx of fxList) {
      if (fx.id <= lastFxRef.current) continue;
      lastFxRef.current = fx.id;
      particlesRef.current.push({ ...fx, born: performance.now(), life: LIFE[fx.kind] ?? 900 });
      if (fx.kind === 'stomp') shakeRef.current = 11;
      if (fx.kind === 'death') shakeRef.current = Math.max(shakeRef.current, 6);
    }
  }, [fxList]);

  // 按舞台可用空间等比缩放（避免 canvas 被 CSS 拉成椭圆）
  useEffect(() => {
    const wrap = wrapRef.current;
    const stage = wrap?.parentElement;
    if (!wrap || !stage) return;
    const fit = () => {
      const style = getComputedStyle(stage);
      const availW = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availH = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const scale = Math.min(availW / ARENA.width, availH / ARENA.height);
      wrap.style.width = `${Math.max(320, Math.floor(ARENA.width * scale))}px`;
      wrap.style.height = `${Math.max(220, Math.floor(ARENA.height * scale))}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);

  // 渲染循环
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(320, Math.round(rect.width * dpr));
      const height = Math.max(220, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const now = performance.now();
      particlesRef.current = particlesRef.current.filter((p) => now - p.born < p.life);
      shakeRef.current *= 0.86;
      drawScene(ctx, getFrame(), assetsRef.current, particlesRef.current, {
        myId,
        shake: shakeRef.current < 0.5 ? 0 : shakeRef.current,
        viewport: { width, height },
      });
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [getFrame, myId]);

  // 键盘
  useEffect(() => {
    const pressed = new Set<string>();
    let lastDx = 0;
    let lastDy = 0;

    const vector = () => {
      let dx = 0;
      let dy = 0;
      if (pressed.has('KeyW') || pressed.has('ArrowUp')) dy -= 1;
      if (pressed.has('KeyS') || pressed.has('ArrowDown')) dy += 1;
      if (pressed.has('KeyA') || pressed.has('ArrowLeft')) dx -= 1;
      if (pressed.has('KeyD') || pressed.has('ArrowRight')) dx += 1;
      return { dx, dy };
    };

    const emit = () => {
      const { dx, dy } = vector();
      if (dx !== lastDx || dy !== lastDy) {
        lastDx = dx;
        lastDy = dy;
        onMove(dx, dy);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (phaseRef.current !== 'fighting') return;
      const code = event.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        pressed.add(code);
        event.preventDefault();
        emit();
        return;
      }
      const key = code === 'KeyJ' ? 'j' : code === 'KeyK' ? 'k' : code === 'KeyL' ? 'l' : null;
      if (key) {
        event.preventDefault();
        if (!event.repeat) onCast(key);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (pressed.delete(event.code)) emit();
    };

    const onBlur = () => {
      pressed.clear();
      lastDx = 0;
      lastDy = 0;
      onMove(0, 0);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    const heartbeat = window.setInterval(() => {
      const { dx, dy } = vector();
      if (dx || dy) onMove(dx, dy);
    }, 600);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.clearInterval(heartbeat);
    };
  }, [onMove, onCast]);

  return (
    <div className="board-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="board" width={ARENA.width} height={ARENA.height} />
      {overlay}
    </div>
  );
}
