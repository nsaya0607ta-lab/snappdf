'use client';

import { useCallback, useRef, useState } from 'react';
import { formatKey, formatTime } from '@/lib/format';
import { usePlayer, usePosition } from '@/state/player';
import { CoverArt } from './CoverArt';
import {
  IconHeart,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconSliders,
  IconStop,
  IconVolume,
} from './icons';

function SeekBar() {
  const { duration, seek } = usePlayer();
  const position = usePosition();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const value = dragging ?? position;
  const ratio = duration > 0 ? Math.min(1, value / duration) : 0;

  const fromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const r = el.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
    },
    [duration],
  );

  return (
    <div className="flex w-full items-center gap-2.5">
      <span className="tabular w-10 shrink-0 text-right text-[11px] text-fg-faint">{formatTime(value)}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="再生位置"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') seek(value - 5);
          else if (e.key === 'ArrowRight') seek(value + 5);
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(fromEvent(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging !== null) setDragging(fromEvent(e.clientX));
        }}
        onPointerUp={(e) => {
          const t = fromEvent(e.clientX);
          setDragging(null);
          seek(t);
        }}
        className="group relative h-6 flex-1 cursor-pointer touch-none"
      >
        <div className="absolute top-1/2 left-0 h-1 w-full -translate-y-1/2 rounded-full bg-line-strong" />
        <div
          className="gradient-accent absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full"
          style={{ width: `${ratio * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg opacity-0 shadow transition-opacity group-hover:opacity-100"
          style={{ left: `${ratio * 100}%`, opacity: dragging !== null ? 1 : undefined }}
        />
      </div>
      <span className="tabular w-10 shrink-0 text-[11px] text-fg-faint">{formatTime(duration)}</span>
    </div>
  );
}

export function PlayerBar({ onOpenPanel }: { onOpenPanel: () => void }) {
  const {
    currentTrack,
    currentSettings,
    playing,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    shuffle,
    setShuffle,
    repeat,
    cycleRepeat,
    toggleFavorite,
    loadingTrack,
  } = usePlayer();

  const volume = currentSettings.volume;
  const volumeLevel: 0 | 1 | 2 = volume === 0 ? 0 : volume < 0.5 ? 1 : 2;
  const hasTrack = Boolean(currentTrack);

  const stop = () => {
    seek(0);
    if (playing) togglePlay();
  };

  return (
    <footer className="glass z-30 border-t border-line pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center lg:gap-5 lg:px-5 lg:py-3">
        {/* 曲情報 */}
        <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
          <CoverArt trackId={currentTrack?.id ?? ''} hasCover={currentTrack?.hasCover ?? false} size={48} rounded="rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{currentTrack?.title ?? '曲が選択されていません'}</p>
            <p className="truncate text-xs text-fg-muted">
              {currentTrack ? currentTrack.artist || '不明なアーティスト' : 'ライブラリから曲を選んでください'}
            </p>
          </div>
          {currentTrack && (
            <div className="flex items-center gap-1">
              <span className="tabular hidden rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent sm:inline">
                {formatKey(currentSettings.semitones)}
              </span>
              <button
                type="button"
                aria-label="お気に入り"
                aria-pressed={currentSettings.favorite}
                onClick={() => toggleFavorite(currentTrack.id)}
                className={`rounded-full p-1.5 transition hover:bg-panel-soft ${
                  currentSettings.favorite ? 'text-accent-2' : 'text-fg-faint'
                }`}
              >
                <IconHeart filled={currentSettings.favorite} className="h-[18px] w-[18px]" />
              </button>
            </div>
          )}
        </div>

        {/* 再生コントロール */}
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="シャッフル"
              aria-pressed={shuffle}
              onClick={() => setShuffle(!shuffle)}
              className={`rounded-full p-2 transition hover:bg-panel-soft ${shuffle ? 'text-accent' : 'text-fg-faint'}`}
            >
              <IconShuffle className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              aria-label="前の曲"
              onClick={previous}
              disabled={!hasTrack}
              className="rounded-full p-2 text-fg transition hover:bg-panel-soft disabled:opacity-30"
            >
              <IconPrev className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={playing ? '一時停止' : '再生'}
              onClick={togglePlay}
              className="gradient-accent grid h-11 w-11 place-items-center rounded-full text-white shadow-lg transition active:scale-95"
            >
              {loadingTrack ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : playing ? (
                <IconPause className="h-5 w-5" />
              ) : (
                <IconPlay className="h-5 w-5 translate-x-px" />
              )}
            </button>
            <button
              type="button"
              aria-label="次の曲"
              onClick={next}
              disabled={!hasTrack}
              className="rounded-full p-2 text-fg transition hover:bg-panel-soft disabled:opacity-30"
            >
              <IconNext className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="停止"
              onClick={stop}
              disabled={!hasTrack}
              className="rounded-full p-2 text-fg-faint transition hover:bg-panel-soft hover:text-fg disabled:opacity-30"
            >
              <IconStop className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="リピート"
              onClick={cycleRepeat}
              className={`rounded-full p-2 transition hover:bg-panel-soft ${repeat === 'off' ? 'text-fg-faint' : 'text-accent'}`}
            >
              {repeat === 'one' ? <IconRepeatOne className="h-[18px] w-[18px]" /> : <IconRepeat className="h-[18px] w-[18px]" />}
            </button>
          </div>
          <SeekBar />
        </div>

        {/* 音量など */}
        <div className="flex shrink-0 items-center justify-end gap-2 lg:w-56">
          <button
            type="button"
            onClick={onOpenPanel}
            aria-label="練習パネルを開く"
            className="rounded-full p-2 text-fg-muted transition hover:bg-panel-soft hover:text-fg lg:hidden"
          >
            <IconSliders className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={volume === 0 ? 'ミュート解除' : 'ミュート'}
            onClick={toggleMute}
            className="rounded-full p-2 text-fg-muted transition hover:bg-panel-soft hover:text-fg"
          >
            <IconVolume level={volumeLevel} className="h-[18px] w-[18px]" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="音量"
            className="hidden w-24 sm:block"
          />
        </div>
      </div>
    </footer>
  );
}
