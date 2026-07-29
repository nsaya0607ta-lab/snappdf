/**
 * トリミング枠のオーバーレイ。
 * 正規化座標（0〜1）で矩形を保持し、Pointer Events で移動・リサイズできる。
 * タッチとマウスの両方に対応（touch-action: none で親のスクロールを抑止）。
 */

import { useCallback, useRef } from 'react';
import type { CropRect } from '../types';
import { clamp } from '../lib/util';

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move';

interface CropOverlayProps {
  value: CropRect;
  onChange: (rect: CropRect) => void;
}

/** 枠の最小サイズ（比率） */
const MIN_SIZE = 0.05;

const HANDLES: Array<{ id: HandleId; style: React.CSSProperties; label: string }> = [
  { id: 'nw', style: { left: -11, top: -11, cursor: 'nwse-resize' }, label: '左上' },
  { id: 'n', style: { left: 'calc(50% - 11px)', top: -11, cursor: 'ns-resize' }, label: '上' },
  { id: 'ne', style: { right: -11, top: -11, cursor: 'nesw-resize' }, label: '右上' },
  { id: 'e', style: { right: -11, top: 'calc(50% - 11px)', cursor: 'ew-resize' }, label: '右' },
  { id: 'se', style: { right: -11, bottom: -11, cursor: 'nwse-resize' }, label: '右下' },
  { id: 's', style: { left: 'calc(50% - 11px)', bottom: -11, cursor: 'ns-resize' }, label: '下' },
  { id: 'sw', style: { left: -11, bottom: -11, cursor: 'nesw-resize' }, label: '左下' },
  { id: 'w', style: { left: -11, top: 'calc(50% - 11px)', cursor: 'ew-resize' }, label: '左' },
];

export function CropOverlay({ value, onChange }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: HandleId; startX: number; startY: number; origin: CropRect } | null>(
    null,
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent, handle: HandleId) => {
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      dragRef.current = {
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin: { ...value },
      };
    },
    [value],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      const container = containerRef.current?.parentElement;
      if (!drag || !container) return;
      event.preventDefault();

      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (event.clientX - drag.startX) / rect.width;
      const dy = (event.clientY - drag.startY) / rect.height;

      onChange(applyDrag(drag.origin, drag.handle, dx, dy));
    },
    [onChange],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    dragRef.current = null;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="crop-mask"
      style={{
        position: 'absolute',
        left: `${value.x * 100}%`,
        top: `${value.y * 100}%`,
        width: `${value.width * 100}%`,
        height: `${value.height * 100}%`,
        touchAction: 'none',
      }}
      onPointerDown={(event) => handlePointerDown(event, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="group"
      aria-label="トリミング範囲"
    >
      <div className="crop-mask__grid" />
      {HANDLES.map((handle) => (
        <button
          key={handle.id}
          type="button"
          className="crop-handle"
          style={handle.style}
          aria-label={`${handle.label}のハンドル`}
          onPointerDown={(event) => handlePointerDown(event, handle.id)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ))}
    </div>
  );
}

/** ドラッグ量を矩形へ反映する（画像外へはみ出さないようクランプ） */
function applyDrag(origin: CropRect, handle: HandleId, dx: number, dy: number): CropRect {
  let { x, y, width, height } = origin;

  if (handle === 'move') {
    x = clamp(origin.x + dx, 0, 1 - origin.width);
    y = clamp(origin.y + dy, 0, 1 - origin.height);
    return { x, y, width, height };
  }

  const right = origin.x + origin.width;
  const bottom = origin.y + origin.height;

  if (handle.includes('w')) {
    x = clamp(origin.x + dx, 0, right - MIN_SIZE);
    width = right - x;
  }
  if (handle.includes('e')) {
    width = clamp(origin.width + dx, MIN_SIZE, 1 - origin.x);
  }
  if (handle.includes('n')) {
    y = clamp(origin.y + dy, 0, bottom - MIN_SIZE);
    height = bottom - y;
  }
  if (handle.includes('s')) {
    height = clamp(origin.height + dy, MIN_SIZE, 1 - origin.y);
  }

  return { x, y, width, height };
}

/** 画像全体を表す矩形 */
export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };
