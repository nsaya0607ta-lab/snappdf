/**
 * ページ 1 枚分のカード。
 * サムネイルは画面内に入ったときだけ生成される（Lazy Load）。
 */

import { memo } from 'react';
import { useThumbnail } from '../hooks/useThumbnail';
import type { EnhanceOptions, PageItem } from '../types';
import { IconCheck, IconCopy, IconDrag, IconEdit, IconTrash } from './icons';

interface PageCardProps {
  page: PageItem;
  index: number;
  enhance: EnhanceOptions;
  selectionMode: boolean;
  selected: boolean;
  dragging: boolean;
  onOpen: (index: number) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDragStart: (event: React.PointerEvent, id: string) => void;
}

function PageCardComponent({
  page,
  index,
  enhance,
  selectionMode,
  selected,
  dragging,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleSelect,
  onDragStart,
}: PageCardProps) {
  const [ref, url, failed] = useThumbnail(page, enhance);

  const className = [
    'card',
    dragging ? 'card--dragging' : '',
    selected ? 'card--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} data-page-index={index} ref={ref}>
      <button
        type="button"
        className="card__thumb"
        onClick={() => (selectionMode ? onToggleSelect(page.id) : onOpen(index))}
        aria-label={`${index + 1}ページ目 ${page.name} を拡大表示`}
      >
        {url ? (
          <img src={url} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : failed ? (
          <span className="muted" style={{ fontSize: 11, padding: 8 }}>
            表示できません
          </span>
        ) : (
          <span className="card__placeholder" />
        )}
        <span className="card__index">{index + 1}</span>
        <span className="card__badges">
          {page.crop ? <span className="badge">切抜</span> : null}
          {page.rotation !== 0 ? <span className="badge">{page.rotation}°</span> : null}
          {page.ocr ? <span className="badge">OCR</span> : null}
        </span>
      </button>

      {selectionMode ? (
        <button
          type="button"
          className="card__check"
          onClick={() => onToggleSelect(page.id)}
          aria-label={`${page.name} を選択`}
          aria-pressed={selected}
        >
          <span>
            <IconCheck size={14} />
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="card__handle"
          onPointerDown={(event) => onDragStart(event, page.id)}
          aria-label={`${page.name} をドラッグして並び替え`}
          title="ドラッグで並び替え"
        >
          <IconDrag size={16} />
        </button>
      )}

      <div className="card__footer">
        <span className="card__name" title={page.name}>
          {page.name}
        </span>
        <button type="button" className="icon-btn" onClick={() => onEdit(page.id)} aria-label="編集">
          <IconEdit size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onDuplicate(page.id)}
          aria-label="複製"
        >
          <IconCopy size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => onDelete(page.id)}
          aria-label="削除"
        >
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  );
}

export const PageCard = memo(PageCardComponent);
