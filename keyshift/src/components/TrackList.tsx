'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { formatKey, formatTime } from '@/lib/format';
import type { Track, TrackSettings } from '@/lib/types';
import { usePlayer } from '@/state/player';
import { CoverArt } from './CoverArt';
import { IconGrip, IconHeart, IconPause, IconPlay, IconPlus, IconTrash } from './icons';

/** 仮想スクロールのために行の高さを固定する */
const ROW_HEIGHT = 56;
const OVERSCAN = 6;

/* ------------------------------------------------------------------ menu */

function RowMenu({ trackId, onRemove }: { trackId: string; onRemove: () => void }) {
  const { playlists, addToPlaylist, createPlaylist } = usePlayer();
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="プレイリストに追加"
        onClick={(e) => {
          // 下に十分な余白がなければ上向きに開く（スクロール領域でメニューが切れないように）
          const rect = e.currentTarget.getBoundingClientRect();
          setDropUp(rect.bottom + 280 > window.innerHeight - 120);
          setOpen((v) => !v);
        }}
        className="rounded-full p-1.5 text-fg-faint transition hover:bg-panel-soft hover:text-fg"
      >
        <IconPlus className="h-4 w-4" />
      </button>
      {open && (
        <div
          className={`animate-rise absolute right-0 z-40 w-56 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} overflow-hidden rounded-xl border border-line bg-panel py-1 elevated`}
        >
          <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-fg-faint uppercase">プレイリストに追加</p>
          <div className="max-h-56 overflow-y-auto">
            {playlists.length === 0 && <p className="px-3 py-2 text-xs text-fg-faint">プレイリストがありません</p>}
            {playlists.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  addToPlaylist(p.id, [trackId]);
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm transition hover:bg-panel-soft"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              const id = await createPlaylist('新しいプレイリスト');
              addToPlaylist(id, [trackId]);
              setOpen(false);
            }}
            className="block w-full border-t border-line px-3 py-2 text-left text-sm text-accent transition hover:bg-panel-soft"
          >
            新規プレイリストを作って追加
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
            className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-accent-2 transition hover:bg-panel-soft"
          >
            <IconTrash className="h-4 w-4" />
            ライブラリから削除
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- row */

interface RowProps {
  track: Track;
  settings: TrackSettings | undefined;
  index: number;
  isCurrent: boolean;
  playing: boolean;
  showAlbum: boolean;
  draggable: boolean;
  onPlay: () => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  dragging?: boolean;
}

const TrackRow = memo(function TrackRow({
  track,
  settings,
  index,
  isCurrent,
  playing,
  showAlbum,
  draggable,
  onPlay,
  onToggleFavorite,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  dragging,
}: RowProps) {
  const semitones = settings?.semitones ?? 0;
  const favorite = settings?.favorite ?? false;
  const memo = settings?.memo ?? '';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={onPlay}
      style={{ height: ROW_HEIGHT }}
      className={`group grid grid-cols-[2rem_auto_1fr_auto] items-center gap-3 rounded-xl px-2 transition sm:grid-cols-[2rem_auto_1fr_auto_auto] ${
        isCurrent ? 'bg-accent-soft' : 'hover:bg-panel-soft'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center justify-center">
        {draggable ? (
          <span className="hidden cursor-grab text-fg-faint group-hover:block active:cursor-grabbing">
            <IconGrip className="h-4 w-4" />
          </span>
        ) : null}
        <button
          type="button"
          onClick={onPlay}
          aria-label={`${track.title} を再生`}
          className={`tabular grid h-7 w-7 place-items-center rounded-full text-xs text-fg-faint transition ${
            draggable ? 'group-hover:hidden' : ''
          }`}
        >
          <span className="group-hover:hidden">
            {isCurrent && playing ? (
              <span className="flex h-3 items-end gap-[2px]">
                <i className="w-[2px] animate-[rise_0.6s_ease-in-out_infinite_alternate] bg-accent" style={{ height: '60%' }} />
                <i className="w-[2px] animate-[rise_0.5s_ease-in-out_infinite_alternate] bg-accent" style={{ height: '100%' }} />
                <i className="w-[2px] animate-[rise_0.7s_ease-in-out_infinite_alternate] bg-accent" style={{ height: '45%' }} />
              </span>
            ) : (
              index + 1
            )}
          </span>
          <span className="hidden text-fg group-hover:block">
            {isCurrent && playing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="h-3.5 w-3.5" />}
          </span>
        </button>
      </div>

      <CoverArt trackId={track.id} hasCover={track.hasCover} size={40} />

      <button type="button" onClick={onPlay} className="min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span className={`truncate text-sm font-medium ${isCurrent ? 'text-accent' : ''}`}>{track.title}</span>
          {semitones !== 0 && (
            <span className="tabular shrink-0 rounded bg-accent-soft px-1.5 py-px text-[10px] font-semibold text-accent">
              {formatKey(semitones)}
            </span>
          )}
          {memo && (
            <span className="shrink-0 rounded bg-panel-soft px-1.5 py-px text-[10px] text-fg-faint" title={memo}>
              メモ
            </span>
          )}
        </div>
        <div className="truncate text-xs text-fg-muted">{track.artist || '不明なアーティスト'}</div>
      </button>

      {showAlbum && <div className="hidden truncate text-xs text-fg-faint sm:block sm:w-40">{track.album}</div>}

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="お気に入り"
          aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={`rounded-full p-1.5 transition hover:bg-panel-soft ${
            favorite ? 'text-accent-2' : 'text-fg-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
          }`}
        >
          <IconHeart filled={favorite} className="h-4 w-4" />
        </button>
        <span className="tabular w-11 text-right text-xs text-fg-faint">{formatTime(track.duration)}</span>
        <div className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <RowMenu trackId={track.id} onRemove={onRemove} />
        </div>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ list */

interface Props {
  ids: string[];
  playlistId?: string;
  showAlbum?: boolean;
  emptyMessage?: string;
}

export function TrackList({ ids, playlistId, showAlbum = true, emptyMessage }: Props) {
  const { trackMap, settings, currentId, playing, playTrack, toggleFavorite, removeTrack, movePlaylistItem, removeFromPlaylist } =
    usePlayer();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 40 });

  /**
   * 表示範囲だけを描画する簡易仮想スクロール。
   * 数千曲のライブラリでもDOMは数十行しか作られない。
   */
  const total = ids.length;
  const recalc = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const visible = Math.ceil(el.clientHeight / ROW_HEIGHT) + OVERSCAN * 2;
    setRange((prev) => {
      const end = Math.min(total, start + visible);
      return prev.start === start && prev.end === end ? prev : { start, end };
    });
  }, [total]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    recalc();
    el.addEventListener('scroll', recalc, { passive: true });
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', recalc);
      ro.disconnect();
    };
  }, [recalc]);

  if (total === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <p className="px-2 py-10 text-center text-sm text-fg-faint">{emptyMessage ?? '曲がありません'}</p>
      </div>
    );
  }

  const start = Math.min(range.start, Math.max(0, total - 1));
  const end = Math.min(total, Math.max(range.end, start + 1));

  return (
    <div ref={scrollerRef} className="h-full overflow-y-auto px-2 py-2 lg:px-4">
      <div style={{ paddingTop: start * ROW_HEIGHT, paddingBottom: (total - end) * ROW_HEIGHT }}>
        {ids.slice(start, end).map((id, offset) => {
          const i = start + offset;
          const track = trackMap.get(id);
          if (!track) return null;
          return (
            <TrackRow
              key={`${id}-${i}`}
              track={track}
              settings={settings.get(id)}
              index={i}
              isCurrent={currentId === id}
              playing={playing}
              showAlbum={showAlbum}
              draggable={Boolean(playlistId)}
              dragging={dragIndex === i}
              onPlay={() => void playTrack(id, ids)}
              onToggleFavorite={() => toggleFavorite(id)}
              onRemove={() => {
                if (playlistId) removeFromPlaylist(playlistId, i);
                else if (window.confirm(`「${track.title}」をライブラリから削除します。よろしいですか？`)) void removeTrack(id);
              }}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                if (!playlistId || dragIndex === null) return;
                e.preventDefault();
              }}
              onDrop={() => {
                if (playlistId && dragIndex !== null && dragIndex !== i) movePlaylistItem(playlistId, dragIndex, i);
                setDragIndex(null);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
