/**
 * アプリのルートコンポーネント。
 *
 * 画面遷移を最小限にするため、一覧を中心に据えて
 * 各機能はシート（モーダル）で重ねる構成にしている。
 *   ①取り込み → ②並び替え → ③編集 → ④PDF設定 → ⑤作成 → ⑥保存・共有
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState } from './components/EmptyState';
import { Lightbox } from './components/Lightbox';
import { PageEditor } from './components/PageEditor';
import { PageGrid } from './components/PageGrid';
import { ProgressOverlay } from './components/ProgressOverlay';
import { ResultSheet } from './components/ResultSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { Toasts } from './components/Toasts';
import { MenuItem, PopoverMenu } from './components/ui';
import {
  IconCheck,
  IconDocument,
  IconImages,
  IconMoon,
  IconMore,
  IconPlus,
  IconSettings,
  IconSort,
  IconSun,
  IconText,
  IconTrash,
} from './components/icons';
import { ACCEPT_ATTRIBUTE, MAX_PAGES, QUALITIES } from './constants';
import { useJob } from './hooks/useJob';
import { useTheme } from './hooks/useTheme';
import { importFiles } from './lib/importFiles';
import { runOcr } from './lib/ocr';
import { resolveEnhance, sourceSize } from './lib/pageUtils';
import { compressPdf } from './lib/pdf/compress';
import { chunkRanges, parseRanges, splitPdf } from './lib/pdf/split';
import { buildPdfViaWorker } from './lib/pipelineClient';
import { downloadBlob, printPdf, shareFile } from './lib/share';
import { releaseThumbnails } from './lib/thumbnails';
import { createZip } from './lib/zip';
import { formatBytes, sanitizeFileName } from './lib/util';
import { useAppDispatch, useAppState } from './store/AppContext';
import type { BuildPageSpec, PageItem, QualityId, SortKey } from './types';
import { MARGINS, PAPER_SIZES } from './constants';

export default function App() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  useTheme(state.theme);

  const notify = useCallback(
    (message: string, tone: 'info' | 'success' | 'error' = 'info') => {
      dispatch({ type: 'toast/push', message, tone });
    },
    [dispatch],
  );

  const job = useJob((message) => notify(message, 'error'));

  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editorPageId, setEditorPageId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  const editorPage = state.pages.find((page) => page.id === editorPageId) ?? null;
  const editorIndex = state.pages.findIndex((page) => page.id === editorPageId);
  const hasOcr = state.pages.some((page) => page.ocr);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const remaining = MAX_PAGES - state.pages.length;
      if (remaining <= 0) {
        notify(`ページ数が上限（${MAX_PAGES}枚）に達しています`, 'error');
        return;
      }

      await job.run('画像を読み込み中', async (signal, update) => {
        const result = await importFiles(files, {
          remaining,
          quality: state.settings.quality,
          signal,
          onProgress: ({ done, total, label }) => {
            update({ ratio: total > 0 ? done / total : null, detail: label });
          },
        });

        if (result.pages.length > 0) dispatch({ type: 'pages/add', pages: result.pages });
        if (result.skippedByLimit > 0) notify(`上限のため ${result.skippedByLimit} 件は追加できませんでした`, 'error');
        for (const error of result.errors.slice(0, 3)) notify(`${error.name}: ${error.reason}`, 'error');
        if (result.pages.length > 0) notify(`${result.pages.length} ページを追加しました`, 'success');
        return result;
      });
    },
    [dispatch, job, notify, state.pages.length, state.settings.quality],
  );

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      void handleFiles(files);
    },
    [handleFiles],
  );

  useEffect(() => {
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      depth += 1;
      setDragActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      depth = 0;
      setDragActive(false);
      void handleFiles(Array.from(event.dataTransfer.files));
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFiles]);

  useEffect(() => {
    if (state.pages.length === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [state.pages.length]);

  const handleDelete = useCallback(
    (id: string) => {
      releaseThumbnails(id);
      dispatch({ type: 'pages/remove', ids: [id] });
    },
    [dispatch],
  );

  const handleDeleteSelected = useCallback(() => {
    if (state.selectedIds.length === 0) return;
    for (const id of state.selectedIds) releaseThumbnails(id);
    dispatch({ type: 'pages/remove', ids: state.selectedIds });
    notify(`${state.selectedIds.length} ページを削除しました`, 'success');
  }, [dispatch, notify, state.selectedIds]);

  const handleSort = useCallback(
    (key: SortKey) => {
      const direction = state.sort.key === key && state.sort.direction === 'asc' ? 'desc' : 'asc';
      dispatch({ type: 'pages/sort', key, direction });
      setSortMenuOpen(false);
      const labels: Record<SortKey, string> = { name: '名前順', lastModified: '更新日時順', capturedAt: '撮影日時順' };
      notify(`${labels[key]}（${direction === 'asc' ? '昇順' : '降順'}）に並び替えました`);
    },
    [dispatch, notify, state.sort],
  );

  const handleOcr = useCallback(
    async (targets: PageItem[]) => {
      if (targets.length === 0) {
        notify('OCR するページがありません');
        return;
      }
      await job.run('文字を認識中', async (signal, update) => {
        let index = 0;
        for (const page of targets) {
          if (signal.aborted) break;
          update({ ratio: index / targets.length, detail: `${index + 1} / ${targets.length} ページ` });
          const ocr = await runOcr(page, {
            signal,
            defaultEnhance: state.enhanceDefaults,
            autoEnhanceEnabled: state.autoEnhanceEnabled,
            onProgress: (ratio) => update({ ratio: (index + ratio) / targets.length }),
          });
          dispatch({ type: 'pages/setOcr', id: page.id, ocr });
          index += 1;
        }
        if (!signal.aborted) {
          dispatch({ type: 'settings/patch', patch: { searchableText: true } });
          notify(`${index} ページの文字を認識しました`, 'success');
        }
        return index;
      });
    },
    [dispatch, job, notify, state.autoEnhanceEnabled, state.enhanceDefaults],
  );

  const buildSpecs = useCallback((): BuildPageSpec[] => {
    const preset = QUALITIES.find((q) => q.id === state.settings.quality) ?? QUALITIES[1];
    return state.pages.map((page) => {
      const size = sourceSize(page);
      const spec: BuildPageSpec = {
        id: page.id,
        blob: page.blob,
        rotation: page.rotation,
        enhance: resolveEnhance(page, state.enhanceDefaults, state.autoEnhanceEnabled),
        maxEdge: preset?.maxEdge ?? 2339,
        jpegQuality: preset?.jpegQuality ?? 0.82,
        sourceWidth: size.width,
        sourceHeight: size.height,
      };
      if (page.crop) spec.crop = page.crop;
      if (state.settings.searchableText && page.ocr) spec.ocr = page.ocr;
      return spec;
    });
  }, [state.autoEnhanceEnabled, state.enhanceDefaults, state.pages, state.settings]);

  const handleCreatePdf = useCallback(async () => {
    if (state.pages.length === 0) return;
    const fileName = `${sanitizeFileName(state.settings.fileName || 'scan')}.pdf`;

    const built = await job.run('PDF を作成中', async (signal, update) => {
      const result = await buildPdfViaWorker(
        { pages: buildSpecs(), settings: state.settings },
        { signal, onProgress: (done, total, label) => update({ ratio: total > 0 ? done / total : null, detail: `${Math.min(done, total)} / ${total} — ${label}` }) },
      );
      const blob = new Blob([result.bytes], { type: 'application/pdf' });
      return { blob, fileName, pageCount: result.pageCount, size: blob.size };
    });

    if (built) {
      dispatch({ type: 'result/set', result: built });
      setShowResult(true);
      notify(`PDF を作成しました（${formatBytes(built.size)}）`, 'success');
    }
  }, [buildSpecs, dispatch, job, notify, state.pages.length, state.settings]);

  const result = state.result;
  const pageCountText = `${state.pages.length} / ${MAX_PAGES}`;
  const allSelected = state.pages.length > 0 && state.selectedIds.length === state.pages.length;
  const selectedTargets = useMemo(() => state.pages.filter((page) => state.selectedIds.includes(page.id)), [state.pages, state.selectedIds]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>SnapPDF</h1>
          <p>画像をまとめてPDFに</p>
        </div>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={() => dispatch({ type: 'theme/toggle' })} aria-label="テーマを切り替え">
            {state.theme === 'dark' ? <IconSun /> : <IconMoon />}
          </button>
          <button className="icon-button" type="button" onClick={() => setToolsMenuOpen((value) => !value)} aria-label="メニュー">
            <IconMore />
          </button>
          <PopoverMenu open={toolsMenuOpen} onClose={() => setToolsMenuOpen(false)} align="right">
            <MenuItem icon={<IconText />} onClick={() => { setToolsMenuOpen(false); void handleOcr(selectedTargets.length > 0 ? selectedTargets : state.pages); }}>
              {selectedTargets.length > 0 ? '選択ページをOCR' : '全ページをOCR'}
            </MenuItem>
            <MenuItem icon={<IconSettings />} onClick={() => { setToolsMenuOpen(false); setShowSettings(true); }}>PDF設定</MenuItem>
          </PopoverMenu>
        </div>
      </header>

      <main>
        {state.pages.length === 0 ? (
          <EmptyState
            dragActive={dragActive}
            onSelectPhotos={() => photoInputRef.current?.click()}
            onTakePhoto={() => cameraInputRef.current?.click()}
            onSelectFiles={() => fileInputRef.current?.click()}
          />
        ) : (
          <>
            <section className="toolbar-card">
              <div className="toolbar-card__summary">
                <IconImages />
                <div><strong>{pageCountText}</strong><span>ページ</span></div>
              </div>
              <div className="toolbar-card__actions">
                <button className="button button--ghost" type="button" onClick={() => photoInputRef.current?.click()}><IconPlus />追加</button>
                <button className="button button--ghost" type="button" onClick={() => setSortMenuOpen((value) => !value)}><IconSort />並び替え</button>
                <PopoverMenu open={sortMenuOpen} onClose={() => setSortMenuOpen(false)} align="right">
                  <MenuItem onClick={() => handleSort('name')}>名前順</MenuItem>
                  <MenuItem onClick={() => handleSort('lastModified')}>更新日時順</MenuItem>
                  <MenuItem onClick={() => handleSort('capturedAt')}>撮影日時順</MenuItem>
                  <MenuItem onClick={() => { dispatch({ type: 'pages/reverse' }); setSortMenuOpen(false); }}>逆順</MenuItem>
                </PopoverMenu>
              </div>
            </section>

            <section className="selection-bar">
              <button className="text-button" type="button" onClick={() => dispatch({ type: allSelected ? 'selection/clear' : 'selection/all' })}>
                <IconCheck />{allSelected ? '選択解除' : 'すべて選択'}
              </button>
              {state.selectedIds.length > 0 && (
                <button className="text-button text-button--danger" type="button" onClick={handleDeleteSelected}><IconTrash />{state.selectedIds.length}件を削除</button>
              )}
            </section>

            <PageGrid
              pages={state.pages}
              selectedIds={state.selectedIds}
              onToggleSelect={(id) => dispatch({ type: 'selection/toggle', id })}
              onOpen={(index) => setLightboxIndex(index)}
              onEdit={(id) => setEditorPageId(id)}
              onDelete={handleDelete}
              onReorder={(from, to) => dispatch({ type: 'pages/reorder', from, to })}
            />
          </>
        )}
      </main>

      {state.pages.length > 0 && (
        <footer className="bottom-bar">
          <button className="button button--secondary" type="button" onClick={() => setShowSettings(true)}><IconSettings />設定</button>
          <button className="button button--primary" type="button" onClick={() => void handleCreatePdf()}><IconDocument />PDFを作成</button>
        </footer>
      )}

      <input ref={photoInputRef} type="file" accept="image/*" multiple hidden onChange={onInputChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onInputChange} />
      <input ref={fileInputRef} type="file" accept={ACCEPT_ATTRIBUTE} multiple hidden onChange={onInputChange} />

      {lightboxIndex !== null && (
        <Lightbox pages={state.pages} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} onEdit={(id) => { setLightboxIndex(null); setEditorPageId(id); }} />
      )}

      {editorPage && (
        <PageEditor
          page={editorPage}
          pageNumber={editorIndex + 1}
          defaults={state.enhanceDefaults}
          autoEnhanceEnabled={state.autoEnhanceEnabled}
          onClose={() => setEditorPageId(null)}
          onPatch={(patch) => dispatch({ type: 'pages/patch', id: editorPage.id, patch })}
          onDuplicate={() => dispatch({ type: 'pages/duplicate', id: editorPage.id })}
          onDelete={() => { handleDelete(editorPage.id); setEditorPageId(null); }}
        />
      )}

      {showSettings && <SettingsSheet settings={state.settings} defaults={state.enhanceDefaults} autoEnhanceEnabled={state.autoEnhanceEnabled} hasOcr={hasOcr} onClose={() => setShowSettings(false)} onSettingsPatch={(patch) => dispatch({ type: 'settings/patch', patch })} onDefaultsPatch={(patch) => dispatch({ type: 'enhance/patch', patch })} onAutoEnhanceChange={(enabled) => dispatch({ type: 'enhance/toggle', enabled })} />}

      {showResult && result && (
        <ResultSheet
          result={result}
          onClose={() => setShowResult(false)}
          onDownload={() => downloadBlob(result.blob, result.fileName)}
          onShare={() => void shareFile(result.blob, result.fileName)}
          onPrint={() => printPdf(result.blob)}
          onCompress={async (quality: QualityId) => {
            const compressed = await job.run('PDFを圧縮中', async (signal, update) => compressPdf(result.blob, quality, { signal, onProgress: (done, total) => update({ ratio: total ? done / total : null, detail: `${done} / ${total}` }) }));
            if (compressed) {
              const next = { ...result, blob: compressed, size: compressed.size, fileName: result.fileName.replace(/\.pdf$/i, '_compressed.pdf') };
              dispatch({ type: 'result/set', result: next });
              notify(`圧縮しました（${formatBytes(compressed.size)}）`, 'success');
            }
          }}
          onSplit={async (mode, value) => {
            const bytes = await result.blob.arrayBuffer();
            const ranges = mode === 'range' ? parseRanges(value, result.pageCount) : mode === 'every' ? chunkRanges(result.pageCount, Number(value) || 1) : chunkRanges(result.pageCount, 1);
            const parts = await splitPdf(bytes, ranges, result.fileName.replace(/\.pdf$/i, ''));
            if (parts.length === 1 && parts[0]) downloadBlob(new Blob([parts[0].bytes], { type: 'application/pdf' }), parts[0].name);
            else if (parts.length > 1) downloadBlob(await createZip(parts.map((part) => ({ name: part.name, data: part.bytes }))), `${result.fileName.replace(/\.pdf$/i, '')}_split.zip`);
          }}
        />
      )}

      {job.state && <ProgressOverlay state={job.state} onCancel={job.cancel} />}
      <Toasts toasts={state.toasts} onDismiss={(id) => dispatch({ type: 'toast/remove', id })} />
    </div>
  );
}
