/**
 * 拡大プレビュー。
 * サムネイルより高解像度の画像を生成して表示し、左右キー／スワイプでページを移動できる。
 */

import { useEffect, useRef, useState } from 'react';
import { PREVIEW_MAX_EDGE } from '../constants';
import { useThumbnail } from '../hooks/useThumbnail';
import { resolveEnhance } from '../lib/pageUtils';
import { formatBytes, formatDateTime } from '../lib/util';
import type { EnhanceOptions, PageItem } from '../types';
import { IconChevronLeft, IconChevronRight, IconClose, IconEdit } from './icons';

interface LightboxProps {
  pages: PageItem[];
  index: number;
  enhanceDefaults: EnhanceOptions;
  autoEnhanceEnabled: boolean;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onEdit: (id: string) => void;
}

export function Lightbox({
  pages,
  index,
  enhanceDefaults,
  autoEnhanceEnabled,
  onIndexChange,
  onClose,
  onEdit,
}: LightboxProps) {
  const page = pages[index];
  const touchStartX = useRef<number | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (event.key === 'ArrowRight' && index < pages.length - 1) onIndexChange(index + 1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [index, pages.length, onClose, onIndexChange]);

  useEffect(() => setImageError(false), [index]);

  if (!page) return null;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="ページのプレビュー"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        if (start === null || end === undefined) return;
        const delta = end - start;
        if (Math.abs(delta) < 48) return;
        if (delta > 0 && index > 0) onIndexChange(index - 1);
        if (delta < 0 && index < pages.length - 1) onIndexChange(index + 1);
      }}
    >
      <div className="lightbox__bar">
        <span className="lightbox__title">{page.name}</span>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          style={{ color: '#fff' }}
          onClick={() => onEdit(page.id)}
          aria-label="このページを編集"
        >
          <IconEdit />
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          style={{ color: '#fff' }}
          onClick={onClose}
          aria-label="閉じる"
        >
          <IconClose />
        </button>
      </div>

      <div className="lightbox__stage">
        <PreviewImage
          page={page}
          enhance={resolveEnhance(page, enhanceDefaults, autoEnhanceEnabled)}
          onError={() => setImageError(true)}
          errored={imageError}
        />
        {index > 0 ? (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            onClick={() => onIndexChange(index - 1)}
            aria-label="前のページ"
          >
            <IconChevronLeft />
          </button>
        ) : null}
        {index < pages.length - 1 ? (
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            onClick={() => onIndexChange(index + 1)}
            aria-label="次のページ"
          >
            <IconChevronRight />
          </button>
        ) : null}
      </div>

      <div className="lightbox__footer">
        {index + 1} / {pages.length} ページ　·　{page.naturalWidth} × {page.naturalHeight} px　·{' '}
        {formatBytes(page.byteSize)}
        {page.capturedAt ? `　·　撮影 ${formatDateTime(page.capturedAt)}` : ''}
      </div>
    </div>
  );
}

function PreviewImage({
  page,
  enhance,
  onError,
  errored,
}: {
  page: PageItem;
  enhance: EnhanceOptions;
  onError: () => void;
  errored: boolean;
}) {
  const [ref, url, failed] = useThumbnail(page, enhance, PREVIEW_MAX_EDGE);
  return (
    <div ref={ref} style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}>
      {url && !errored ? (
        <img src={url} alt={page.name} onError={onError} />
      ) : failed || errored ? (
        <span style={{ color: '#fff' }}>画像を表示できませんでした</span>
      ) : (
        <span className="card__placeholder" />
      )}
    </div>
  );
}
