'use client';

import { useEffect } from 'react';
import { IconClose } from './icons';

export const SHORTCUTS: [string, string][] = [
  ['Space', '再生 / 一時停止'],
  ['← / →', '5秒 戻る / 進む'],
  ['Shift + ← / →', '前の曲 / 次の曲'],
  ['↑ / ↓', '音量 上げる / 下げる'],
  ['Z / X', 'キー −1 / +1 半音'],
  ['C / V', 'テンポ −0.05 / +0.05 倍'],
  ['0', 'キーとテンポを原曲に戻す'],
  ['A / B', 'A地点 / B地点を指定'],
  ['L', 'ABリピート ON / OFF'],
  ['S', 'シャッフル切り替え'],
  ['R', 'リピート切り替え'],
  ['M', 'ミュート切り替え'],
  ['F', 'お気に入り切り替え'],
  ['/', '検索欄にフォーカス'],
  ['?', 'このヘルプを表示'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="キーボードショートカット"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-rise max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-5 elevated"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">キーボードショートカット</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-1.5 hover:bg-panel-soft">
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <dl className="flex flex-col gap-1">
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 hover:bg-panel-soft">
              <dt className="shrink-0">
                <kbd className="rounded-md border border-line bg-panel-soft px-2 py-1 font-mono text-[11px] text-fg-muted">
                  {keys}
                </kbd>
              </dt>
              <dd className="min-w-0 text-right text-sm text-fg-muted">{desc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[11px] leading-relaxed text-fg-faint">
          文字入力中はショートカットが無効になります。
        </p>
      </div>
    </div>
  );
}
