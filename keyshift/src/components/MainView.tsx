'use client';

import { useMemo, useRef, useState } from 'react';
import { normalizeForSearch } from '@/lib/format';
import { usePlayer } from '@/state/player';
import type { View } from './Sidebar';
import { TrackList } from './TrackList';
import { IconMusic, IconPlay, IconPlus, IconSearch, IconShuffle } from './icons';

type SortKey = 'added' | 'title' | 'artist' | 'plays' | 'duration';

const SORT_LABELS: Record<SortKey, string> = {
  added: '追加順',
  title: 'タイトル',
  artist: 'アーティスト',
  plays: '再生回数',
  duration: '再生時間',
};

const VIEW_TITLES = {
  library: 'ライブラリ',
  favorites: 'お気に入り',
  recent: '最近再生した曲',
} as const;

export function MainView({ view, onOpenMenu }: { view: View; onOpenMenu: () => void }) {
  const { tracks, settings, playlists, playTrack, setShuffle, addFiles, addProgress, ready } = usePlayer();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 検索用の正規化済み文字列をあらかじめ作っておく（大量の曲でも高速） */
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tracks) {
      const s = settings.get(t.id);
      map.set(t.id, normalizeForSearch([t.title, t.artist, t.album, t.fileName, s?.memo ?? ''].join(' ')));
    }
    return map;
  }, [tracks, settings]);

  const playlist = view.kind === 'playlist' ? playlists.find((p) => p.id === view.id) : undefined;

  const ids = useMemo(() => {
    let base: string[];
    if (view.kind === 'playlist') base = playlist?.trackIds ?? [];
    else if (view.kind === 'favorites') base = tracks.filter((t) => settings.get(t.id)?.favorite).map((t) => t.id);
    else if (view.kind === 'recent')
      base = tracks
        .filter((t) => settings.get(t.id)?.lastPlayedAt)
        .sort((a, b) => (settings.get(b.id)?.lastPlayedAt ?? 0) - (settings.get(a.id)?.lastPlayedAt ?? 0))
        .map((t) => t.id);
    else base = tracks.map((t) => t.id);

    const q = normalizeForSearch(query);
    if (q) base = base.filter((id) => searchIndex.get(id)?.includes(q));

    // プレイリストと「最近再生」は並び順そのものに意味があるので並べ替えない
    if (view.kind === 'playlist' || view.kind === 'recent' || sort === 'added') return base;

    const byId = new Map(tracks.map((t) => [t.id, t]));
    return base.slice().sort((a, b) => {
      const ta = byId.get(a);
      const tb = byId.get(b);
      if (!ta || !tb) return 0;
      switch (sort) {
        case 'title':
          return ta.title.localeCompare(tb.title, 'ja');
        case 'artist':
          return (ta.artist || '').localeCompare(tb.artist || '', 'ja') || ta.title.localeCompare(tb.title, 'ja');
        case 'plays':
          return (settings.get(b)?.playCount ?? 0) - (settings.get(a)?.playCount ?? 0);
        case 'duration':
          return tb.duration - ta.duration;
        default:
          return 0;
      }
    });
  }, [view, playlist, tracks, settings, query, sort, searchIndex]);

  const title = view.kind === 'playlist' ? (playlist?.name ?? 'プレイリスト') : VIEW_TITLES[view.kind];

  const playAll = (shuffled: boolean) => {
    if (ids.length === 0) return;
    setShuffle(shuffled);
    const first = shuffled ? ids[Math.floor(Math.random() * ids.length)] : ids[0];
    void playTrack(first, ids);
  };

  const onPick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    void addFiles(Array.from(list));
  };

  return (
    <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 px-3 pt-3 pb-2 backdrop-blur-xl lg:px-6 lg:pt-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="メニュー"
            className="rounded-lg p-2 text-fg-muted transition hover:bg-panel-soft lg:hidden"
          >
            <span className="block h-[2px] w-5 bg-current" />
            <span className="mt-1 block h-[2px] w-5 bg-current" />
            <span className="mt-1 block h-[2px] w-5 bg-current" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold tracking-tight lg:text-2xl">{title}</h2>
            <p className="text-xs text-fg-faint">{ids.length} 曲</p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="gradient-accent flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition active:scale-95"
          >
            <IconPlus className="h-4 w-4" />
            <span className="hidden sm:inline">曲を追加</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus"
            multiple
            hidden
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* 狭い画面では検索欄を1行占有させる（潰れてしまうのを防ぐ） */}
          <div className="relative w-full sm:w-auto sm:max-w-xs sm:min-w-0 sm:flex-1">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <input
              ref={inputRef}
              data-search-input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="曲名・アーティスト・メモを検索"
              className="w-full rounded-full border border-line bg-panel py-2 pr-3 pl-9 text-sm placeholder:text-fg-faint focus:border-accent focus:outline-none"
            />
          </div>

          {view.kind !== 'playlist' && view.kind !== 'recent' && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="並び替え"
              className="rounded-full border border-line bg-panel px-3 py-2 text-xs text-fg-muted focus:border-accent focus:outline-none"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => playAll(false)}
              disabled={ids.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-2 text-xs font-medium transition hover:border-line-strong disabled:opacity-40"
            >
              <IconPlay className="h-3.5 w-3.5" />
              すべて再生
            </button>
            <button
              type="button"
              onClick={() => playAll(true)}
              disabled={ids.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-2 text-xs font-medium transition hover:border-line-strong disabled:opacity-40"
            >
              <IconShuffle className="h-3.5 w-3.5" />
              シャッフル
            </button>
          </div>
        </div>

        {addProgress && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <span className="truncate">
              取り込み中 {addProgress.done + 1}/{addProgress.total} — {addProgress.current}
            </span>
          </div>
        )}
      </header>

      {/* スクロールは TrackList 側（仮想スクロール）が受け持つ */}
      <div className="min-h-0 flex-1">
        {!ready ? (
          <p className="px-2 py-10 text-center text-sm text-fg-faint">読み込み中…</p>
        ) : tracks.length === 0 ? (
          <div className="h-full overflow-y-auto">
            <EmptyLibrary onPick={() => fileRef.current?.click()} />
          </div>
        ) : (
          <TrackList
            key={view.kind === 'playlist' ? `pl-${view.id}` : view.kind}
            ids={ids}
            playlistId={view.kind === 'playlist' ? view.id : undefined}
            emptyMessage={
              query
                ? '検索に一致する曲がありません'
                : view.kind === 'favorites'
                  ? 'お気に入りに追加した曲がここに並びます'
                  : view.kind === 'recent'
                    ? '再生した曲がここに並びます'
                    : 'このプレイリストは空です。曲の「+」から追加できます'
            }
          />
        )}
      </div>
    </main>
  );
}

function EmptyLibrary({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="gradient-accent mb-5 grid h-16 w-16 place-items-center rounded-2xl text-white shadow-xl">
        <IconMusic className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold">音楽ファイルを追加してください</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
        MP3 / WAV / M4A / AAC / FLAC に対応しています。
        ウィンドウにドラッグ＆ドロップするか、下のボタンから選択してください。
        ファイルは端末内にのみ保存され、外部へ送信されることはありません。
      </p>
      <button
        type="button"
        onClick={onPick}
        className="gradient-accent mt-6 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition active:scale-95"
      >
        ファイルを選択
      </button>
    </div>
  );
}
