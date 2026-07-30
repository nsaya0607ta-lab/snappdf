'use client';

import { useEffect, useState } from 'react';
import { getCover } from '@/lib/db';
import { IconMusic } from './icons';

/**
 * アルバム画像は必要になったときだけ IndexedDB から読み出し、
 * ObjectURL をキャッシュする。上限を超えた分は revoke して解放する。
 */
const MAX_CACHE = 240;
const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function remember(id: string, url: string | null): void {
  cache.set(id, url);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const value = cache.get(oldest);
    if (value) URL.revokeObjectURL(value);
    cache.delete(oldest);
  }
}

function loadCover(id: string): Promise<string | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id) ?? null);
  const existing = pending.get(id);
  if (existing) return existing;
  const p = getCover(id)
    .then((blob) => {
      const url = blob ? URL.createObjectURL(blob) : null;
      remember(id, url);
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

interface Props {
  trackId: string;
  hasCover: boolean;
  size?: number;
  rounded?: string;
  className?: string;
}

export function CoverArt({ trackId, hasCover, size = 44, rounded = 'rounded-lg', className = '' }: Props) {
  const [url, setUrl] = useState<string | null>(() => cache.get(trackId) ?? null);

  useEffect(() => {
    if (!hasCover) {
      setUrl(null);
      return;
    }
    let alive = true;
    void loadCover(trackId).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [trackId, hasCover]);

  return (
    <div
      className={`${rounded} relative shrink-0 overflow-hidden bg-panel-soft ring-1 ring-line ${className}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-accent-soft to-transparent">
          <IconMusic className="text-fg-faint" style={{ width: size * 0.42, height: size * 0.42 }} />
        </div>
      )}
    </div>
  );
}
