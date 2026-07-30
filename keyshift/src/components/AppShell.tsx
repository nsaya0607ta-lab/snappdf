'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlayer } from '@/state/player';
import { MainView } from './MainView';
import { PlayerBar } from './PlayerBar';
import { PracticePanel } from './PracticePanel';
import { ShortcutsDialog } from './ShortcutsDialog';
import { Sidebar, type View } from './Sidebar';
import { IconClose, IconMusic } from './icons';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function AppShell() {
  const player = usePlayer();
  const {
    addFiles,
    togglePlay,
    seekBy,
    next,
    previous,
    nudgeSemitones,
    nudgeTempo,
    resetKeyAndTempo,
    markLoopA,
    markLoopB,
    toggleLoop,
    setShuffle,
    shuffle,
    cycleRepeat,
    toggleMute,
    setVolume,
    currentSettings,
    currentId,
    toggleFavorite,
    error,
    dismissError,
  } = player;

  const [view, setView] = useState<View>({ kind: 'library' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  /* ---------------------------------------------------- ドラッグ＆ドロップ */

  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      setDragging(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      void addFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [addFiles]);

  /* ------------------------------------------------------- ショートカット */

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      const shift = e.shiftKey;
      const key = e.key;
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      switch (key) {
        case ' ':
          handled();
          togglePlay();
          break;
        case 'ArrowLeft':
          handled();
          if (shift) previous();
          else seekBy(-5);
          break;
        case 'ArrowRight':
          handled();
          if (shift) next();
          else seekBy(5);
          break;
        case 'ArrowUp':
          handled();
          setVolume(Math.min(1, currentSettings.volume + 0.05));
          break;
        case 'ArrowDown':
          handled();
          setVolume(Math.max(0, currentSettings.volume - 0.05));
          break;
        case '?':
          handled();
          setShortcutsOpen(true);
          break;
        case '/':
          handled();
          document.querySelector<HTMLInputElement>('[data-search-input]')?.focus();
          break;
        case '0':
          handled();
          resetKeyAndTempo();
          break;
        case 'Escape':
          setPanelOpen(false);
          setMenuOpen(false);
          break;
        default:
          break;
      }

      switch (key.toLowerCase()) {
        case 'z':
          handled();
          nudgeSemitones(-1);
          break;
        case 'x':
          handled();
          nudgeSemitones(1);
          break;
        case 'c':
          handled();
          nudgeTempo(-0.05);
          break;
        case 'v':
          handled();
          nudgeTempo(0.05);
          break;
        case 'a':
          handled();
          markLoopA();
          break;
        case 'b':
          handled();
          markLoopB();
          break;
        case 'l':
          handled();
          toggleLoop();
          break;
        case 's':
          handled();
          setShuffle(!shuffle);
          break;
        case 'r':
          handled();
          cycleRepeat();
          break;
        case 'm':
          handled();
          toggleMute();
          break;
        case 'f':
          handled();
          if (currentId) toggleFavorite(currentId);
          break;
        default:
          break;
      }
    },
    [
      togglePlay,
      seekBy,
      next,
      previous,
      setVolume,
      currentSettings.volume,
      resetKeyAndTempo,
      nudgeSemitones,
      nudgeTempo,
      markLoopA,
      markLoopB,
      toggleLoop,
      setShuffle,
      shuffle,
      cycleRepeat,
      toggleMute,
      currentId,
      toggleFavorite,
    ],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onKeyDown]);

  /* -------------------------------------------------------------- 通知 */

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(dismissError, 4500);
    return () => clearTimeout(t);
  }, [error, dismissError]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      {/* grid-rows を明示しないと行が内容の高さまで伸び、内側のスクロールが効かなくなる */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden lg:grid-cols-[248px_minmax(0,1fr)_368px]">
        {/* サイドバー（デスクトップ） */}
        <div className="hidden min-h-0 overflow-hidden lg:block">
          <Sidebar view={view} onChange={setView} onShowShortcuts={() => setShortcutsOpen(true)} />
        </div>

        <MainView view={view} onOpenMenu={() => setMenuOpen(true)} />

        {/* 練習パネル（デスクトップ） */}
        <aside className="hidden min-h-0 overflow-hidden border-l border-line bg-bg-deep lg:block">
          <PracticePanel />
        </aside>
      </div>

      <PlayerBar onOpenPanel={() => setPanelOpen(true)} />

      {/* サイドバー（モバイル・ドロワー） */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-bg-deep shadow-2xl">
            <Sidebar
              view={view}
              onChange={setView}
              onShowShortcuts={() => {
                setMenuOpen(false);
                setShortcutsOpen(true);
              }}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 練習パネル（モバイル・ボトムシート） */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPanelOpen(false)} />
          <div className="animate-rise absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-2xl border-t border-line bg-bg-deep shadow-2xl">
            <PracticePanel onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      )}

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* ドラッグ＆ドロップのオーバーレイ */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-panel px-10 py-8 text-center">
            <IconMusic className="h-9 w-9 text-accent" />
            <p className="text-base font-semibold">ドロップして音楽ファイルを追加</p>
            <p className="text-xs text-fg-muted">MP3 / WAV / M4A / AAC / FLAC</p>
          </div>
        </div>
      )}

      {/* エラー通知 */}
      {error && (
        <div className="animate-rise fixed bottom-28 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-panel px-4 py-2.5 elevated">
          <span className="truncate text-sm">{error}</span>
          <button type="button" onClick={dismissError} aria-label="閉じる" className="rounded-full p-1 hover:bg-panel-soft">
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
