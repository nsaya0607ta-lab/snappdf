/**
 * ページ編集シート。
 * 回転・トリミング・自動補正・複製・削除・OCR をこの 1 画面で行える。
 */

import { useMemo, useState } from 'react';
import { PREVIEW_MAX_EDGE } from '../constants';
import { useThumbnail } from '../hooks/useThumbnail';
import { resolveEnhance } from '../lib/pageUtils';
import { rotateBy } from '../lib/pageUtils';
import { formatBytes, formatDateTime } from '../lib/util';
import type { CropRect, EnhanceOptions, PageItem } from '../types';
import { CropOverlay, FULL_CROP } from './CropOverlay';
import {
  IconCopy,
  IconCrop,
  IconRotate,
  IconRotateLeft,
  IconText,
  IconTrash,
  IconWand,
} from './icons';
import { Field, Sheet, SwitchRow } from './ui';

interface PageEditorProps {
  page: PageItem;
  index: number;
  total: number;
  enhanceDefaults: EnhanceOptions;
  autoEnhanceEnabled: boolean;
  ocrBusy: boolean;
  onPatch: (id: string, patch: Partial<PageItem>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRunOcr: (page: PageItem) => void;
  onClose: () => void;
}

export function PageEditor({
  page,
  index,
  total,
  enhanceDefaults,
  autoEnhanceEnabled,
  ocrBusy,
  onPatch,
  onDuplicate,
  onDelete,
  onRunOcr,
  onClose,
}: PageEditorProps) {
  const [cropMode, setCropMode] = useState(false);
  const [draftCrop, setDraftCrop] = useState<CropRect>(page.crop ?? FULL_CROP);
  /** 画像の読み込みが完了した URL。切り替え直後のレイアウト移動中に
   *  トリミング枠を触ってしまわないよう、読み込み完了後だけ枠を表示する */
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  const effectiveEnhance = resolveEnhance(page, enhanceDefaults, autoEnhanceEnabled);

  // トリミング枠を操作しやすいよう、プレビューは「切り抜き前」の状態を表示する
  const previewPage = useMemo<PageItem>(
    () => (cropMode ? { ...page, crop: undefined } : page),
    [page, cropMode],
  );
  const [ref, url] = useThumbnail(previewPage, effectiveEnhance, PREVIEW_MAX_EDGE);

  const setEnhance = (patch: Partial<EnhanceOptions>) => {
    onPatch(page.id, { enhance: { ...effectiveEnhance, ...patch } });
  };

  const applyCrop = () => {
    const isFull =
      draftCrop.x <= 0.001 &&
      draftCrop.y <= 0.001 &&
      draftCrop.width >= 0.999 &&
      draftCrop.height >= 0.999;
    onPatch(page.id, { crop: isFull ? undefined : draftCrop });
    setCropMode(false);
  };

  return (
    <Sheet
      title={`ページ ${index + 1} / ${total} を編集`}
      onClose={onClose}
      wide
      footer={
        cropMode ? (
          <>
            <button
              type="button"
              className="btn btn--block"
              onClick={() => {
                setDraftCrop(FULL_CROP);
              }}
            >
              全体に戻す
            </button>
            <button type="button" className="btn btn--block" onClick={() => setCropMode(false)}>
              キャンセル
            </button>
            <button type="button" className="btn btn--primary btn--block" onClick={applyCrop}>
              適用
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--primary btn--block btn--lg" onClick={onClose}>
            完了
          </button>
        )
      }
    >
      <div className="editor__stage">
        <div className="editor__canvas" ref={ref}>
          {url ? (
            <>
              <img
                src={url}
                alt={page.name}
                draggable={false}
                onLoad={() => setLoadedUrl(url)}
              />
              {cropMode && loadedUrl === url ? (
                <CropOverlay value={draftCrop} onChange={setDraftCrop} />
              ) : null}
            </>
          ) : (
            <span className="card__placeholder" />
          )}
        </div>
      </div>

      <div className="row" style={{ margin: '14px 0', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn"
          onClick={() => onPatch(page.id, { rotation: rotateBy(page.rotation, -90) })}
          disabled={cropMode}
        >
          <IconRotateLeft size={18} />
          左に回転
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onPatch(page.id, { rotation: rotateBy(page.rotation, 90) })}
          disabled={cropMode}
        >
          <IconRotate size={18} />
          右に回転
        </button>
        <button
          type="button"
          className={`btn${cropMode ? ' btn--primary' : ''}`}
          onClick={() => {
            setDraftCrop(page.crop ?? FULL_CROP);
            setCropMode((mode) => !mode);
          }}
        >
          <IconCrop size={18} />
          トリミング
        </button>
      </div>

      {!cropMode ? (
        <>
          <Field label="このページの自動補正" hint="全体設定より優先されます">
            <div className="stack" style={{ gap: 0 }}>
              <SwitchRow
                title="傾き補正"
                description="文字行が水平になるよう自動で回転"
                checked={effectiveEnhance.deskew}
                onChange={(checked) => setEnhance({ deskew: checked })}
              />
              <SwitchRow
                title="明るさ補正"
                description="暗く写った書類を明るく"
                checked={effectiveEnhance.brightness}
                onChange={(checked) => setEnhance({ brightness: checked })}
              />
              <SwitchRow
                title="コントラスト補正"
                description="文字をくっきりさせる"
                checked={effectiveEnhance.contrast}
                onChange={(checked) => setEnhance({ contrast: checked })}
              />
              <SwitchRow
                title="白黒スキャン化"
                description="影やムラを消して白黒 2 値に"
                checked={effectiveEnhance.monochrome}
                onChange={(checked) => setEnhance({ monochrome: checked })}
              />
            </div>
          </Field>

          {page.enhance ? (
            <button
              type="button"
              className="btn btn--sm"
              style={{ marginTop: -8, marginBottom: 16 }}
              onClick={() => onPatch(page.id, { enhance: undefined })}
            >
              <IconWand size={15} />
              全体設定に戻す
            </button>
          ) : null}

          <Field label="文字認識（OCR）" hint="認識したテキストは検索可能 PDF の作成に使えます">
            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => onRunOcr(page)}
                disabled={ocrBusy}
              >
                <IconText size={18} />
                {page.ocr ? 'OCR をやり直す' : 'このページを OCR'}
              </button>
              {page.ocr ? (
                <span className="muted">
                  {page.ocr.words.length} 語を認識（{formatDateTime(page.ocr.updatedAt)}）
                </span>
              ) : null}
            </div>
            {page.ocr && page.ocr.text ? (
              <div className="ocr-text" style={{ marginTop: 10 }}>
                {page.ocr.text}
              </div>
            ) : null}
          </Field>

          <div className="notice" style={{ marginBottom: 14 }}>
            {page.naturalWidth} × {page.naturalHeight} px　·　{formatBytes(page.byteSize)}
            {page.capturedAt ? `　·　撮影日時 ${formatDateTime(page.capturedAt)}` : ''}
          </div>

          <div className="row">
            <button type="button" className="btn" onClick={() => onDuplicate(page.id)}>
              <IconCopy size={18} />
              複製
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                onDelete(page.id);
                onClose();
              }}
            >
              <IconTrash size={18} />
              削除
            </button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ textAlign: 'center' }}>
          枠の四隅・辺をドラッグして範囲を調整し、「適用」を押してください。
        </p>
      )}
    </Sheet>
  );
}
