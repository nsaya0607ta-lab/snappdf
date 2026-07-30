'use client';

import { useEffect, useState } from 'react';
import { estimateUsage } from '@/lib/db';
import { formatBytes } from '@/lib/format';
import { usePlayer } from '@/state/player';
import { ThemeToggle } from './ThemeToggle';
import { IconClock, IconEdit, IconHeart, IconKeyboard, IconLibrary, IconList, IconPlus, IconTrash } from './icons';

export type View = { kind: 'library' | 'favorites' | 'recent' } | { kind: 'playlist'; id: string };

interface Props {
  view: View;
  onChange: (v: View) => void;
  onShowShortcuts: () => void;
  onNavigate?: () => void;
}

function NavItem({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
        active ? 'bg-accent-soft font-semibold text-accent' : 'text-fg-muted hover:bg-panel-soft hover:text-fg'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="tabular shrink-0 text-[11px] text-fg-faint">{count}</span>}
    </button>
  );
}

export function Sidebar({ view, onChange, onShowShortcuts, onNavigate }: Props) {
  const { tracks, settings, playlists, createPlaylist, renamePlaylist, removePlaylist } = usePlayer();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [usage, setUsage] = useState<string | null>(null);

  const favoriteCount = tracks.filter((t) => settings.get(t.id)?.favorite).length;
  const recentCount = tracks.filter((t) => settings.get(t.id)?.lastPlayedAt).length;

  useEffect(() => {
    void estimateUsage().then((u) => {
      if (u) setUsage(`${formatBytes(u.usage)} 使用中`);
    });
  }, [tracks.length]);

  const go = (v: View) => {
    onChange(v);
    onNavigate?.();
  };

  return (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto border-r border-line bg-bg-deep px-3 py-4">
      <div className="px-2">
        <h1 className="text-gradient-accent text-lg leading-tight font-bold tracking-tight">KeyShift</h1>
        <p className="mt-0.5 text-[11px] text-fg-faint">カラオケ練習プレイヤー</p>
      </div>

      <div className="flex flex-col gap-0.5">
        <NavItem
          active={view.kind === 'library'}
          icon={<IconLibrary className="h-[18px] w-[18px]" />}
          label="ライブラリ"
          count={tracks.length}
          onClick={() => go({ kind: 'library' })}
        />
        <NavItem
          active={view.kind === 'favorites'}
          icon={<IconHeart className="h-[18px] w-[18px]" />}
          label="お気に入り"
          count={favoriteCount}
          onClick={() => go({ kind: 'favorites' })}
        />
        <NavItem
          active={view.kind === 'recent'}
          icon={<IconClock className="h-[18px] w-[18px]" />}
          label="最近再生した曲"
          count={recentCount}
          onClick={() => go({ kind: 'recent' })}
        />
      </div>

      <div className="min-h-0 flex-1">
        <div className="mb-1 flex items-center justify-between px-2.5">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-fg-faint uppercase">プレイリスト</span>
          <button
            type="button"
            aria-label="プレイリストを作成"
            onClick={async () => {
              const id = await createPlaylist('新しいプレイリスト');
              setEditing(id);
              setDraft('新しいプレイリスト');
              go({ kind: 'playlist', id });
            }}
            className="rounded-full p-1 text-fg-faint transition hover:bg-panel-soft hover:text-fg"
          >
            <IconPlus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {playlists.length === 0 && <p className="px-2.5 py-2 text-xs text-fg-faint">まだありません</p>}
          {playlists.map((p) =>
            editing === p.id ? (
              <input
                key={p.id}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  renamePlaylist(p.id, draft);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="mx-1 rounded-lg border border-accent bg-panel px-2 py-1.5 text-sm focus:outline-none"
              />
            ) : (
              <div key={p.id} className="group relative flex items-center">
                <NavItem
                  active={view.kind === 'playlist' && view.id === p.id}
                  icon={<IconList className="h-[18px] w-[18px]" />}
                  label={p.name}
                  count={p.trackIds.length}
                  onClick={() => go({ kind: 'playlist', id: p.id })}
                />
                <div className="absolute right-1 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label="名前を変更"
                    onClick={() => {
                      setEditing(p.id);
                      setDraft(p.name);
                    }}
                    className="rounded p-1 text-fg-faint hover:bg-panel hover:text-fg"
                  >
                    <IconEdit className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="プレイリストを削除"
                    onClick={() => {
                      if (!window.confirm(`プレイリスト「${p.name}」を削除します。曲自体は残ります。`)) return;
                      void removePlaylist(p.id);
                      if (view.kind === 'playlist' && view.id === p.id) go({ kind: 'library' });
                    }}
                    className="rounded p-1 text-fg-faint hover:bg-panel hover:text-accent-2"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={onShowShortcuts}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] text-fg-muted transition hover:bg-panel-soft hover:text-fg"
          >
            <IconKeyboard className="h-4 w-4" />
            ショートカット
          </button>
          <ThemeToggle />
        </div>
        <p className="mt-1.5 px-2.5 text-[10px] leading-relaxed text-fg-faint">
          {usage ? `${usage}・` : ''}すべて端末内で処理しています
        </p>
      </div>
    </nav>
  );
}
