'use client';

import { useCallback, useEffect, useRef } from 'react';
import { positionStore } from '@/state/position-store';

interface Props {
  peaks: Int8Array | null;
  duration: number;
  loopA: number | null;
  loopB: number | null;
  loopEnabled: boolean;
  onSeek: (time: number) => void;
  height?: number;
}

function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * 波形表示。再生位置は positionStore から rAF で直接読むので、
 * 秒間30回の位置更新で React の再描画は発生しない。
 */
export function Waveform({ peaks, duration, loopA, loopB, loopEnabled, onSeek, height = 76 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ peaks, duration, loopA, loopB, loopEnabled });
  propsRef.current = { peaks, duration, loopA, loopB, loopEnabled };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastKey = '';
    let width = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = wrap.clientWidth;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = '100%';
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastKey = '';
    };

    const draw = () => {
      const { peaks: pk, duration: dur, loopA: a, loopB: b, loopEnabled: on } = propsRef.current;
      const pos = positionStore.getSnapshot();
      const key = `${width}|${pk?.length ?? 0}|${dur}|${a}|${b}|${on}|${Math.round(pos * 40)}`;
      if (key === lastKey) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastKey = key;

      const el = wrap;
      const accent = cssVar(el, '--accent') || '#8b6bff';
      const accent2 = cssVar(el, '--accent-2') || '#ff4d80';
      const idle = cssVar(el, '--line-strong') || 'rgba(255,255,255,0.16)';

      ctx.clearRect(0, 0, width, height);

      if (!pk || pk.length === 0 || width === 0) {
        ctx.fillStyle = idle;
        ctx.fillRect(0, height / 2 - 1, width, 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      const buckets = pk.length / 2;
      const barWidth = 2;
      const gap = 1;
      const count = Math.max(1, Math.floor(width / (barWidth + gap)));
      const mid = height / 2;
      const progress = dur > 0 ? Math.min(1, pos / dur) : 0;
      const playedX = progress * width;

      // ABリピート区間の帯
      if (a !== null && b !== null && dur > 0) {
        const x1 = (a / dur) * width;
        const x2 = (b / dur) * width;
        ctx.fillStyle = on ? 'rgba(240, 64, 122, 0.16)' : 'rgba(128,128,140,0.10)';
        ctx.fillRect(x1, 0, Math.max(1, x2 - x1), height);
      }

      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, accent);
      grad.addColorStop(1, accent2);

      for (let i = 0; i < count; i++) {
        const x = i * (barWidth + gap);
        const bucket = Math.min(buckets - 1, Math.floor((i / count) * buckets));
        const min = pk[bucket * 2] / 127;
        const max = pk[bucket * 2 + 1] / 127;
        const top = mid - Math.max(1, max * mid * 0.94);
        const bottom = mid - Math.min(-1, min * mid * 0.94);
        ctx.fillStyle = x + barWidth <= playedX ? grad : idle;
        ctx.globalAlpha = x + barWidth <= playedX ? 1 : 0.55;
        ctx.fillRect(x, top, barWidth, Math.max(2, bottom - top));
      }
      ctx.globalAlpha = 1;

      // 再生ヘッド
      ctx.fillStyle = accent2;
      ctx.fillRect(Math.min(width - 2, playedX), 0, 2, height);

      // A / B マーカー
      const marker = (t: number, label: string, color: string) => {
        if (dur <= 0) return;
        const x = (t / dur) * width;
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, 0, 2, height);
        ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
        const w = 14;
        const bx = Math.min(width - w, Math.max(0, x - w / 2));
        ctx.fillRect(bx, 0, w, 13);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(label, bx + w / 2, 9.5);
      };
      if (a !== null) marker(a, 'A', accent);
      if (b !== null) marker(b, 'B', accent2);

      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [height]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const wrap = wrapRef.current;
      if (!wrap || duration <= 0) return;
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) seekFromEvent(e.clientX);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      className="relative w-full cursor-pointer touch-none select-none overflow-hidden rounded-xl bg-panel-soft/60 ring-1 ring-line"
      style={{ height }}
      role="slider"
      aria-label="波形シーク"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={0}
      tabIndex={-1}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
