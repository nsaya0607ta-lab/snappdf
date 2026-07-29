import { useEffect, useMemo, useState } from 'react';
import { PDFDocument } from 'pdf-lib';

type ImageItem = {
  id: string;
  file: File;
  url: string;
};

const MAX_IMAGES = 100;

export default function App() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    return () => images.forEach((item) => URL.revokeObjectURL(item.url));
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, item) => sum + item.file.size, 0),
    [images],
  );

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_IMAGES - images.length;
    const accepted = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, Math.max(0, remaining));

    if (accepted.length === 0) {
      setMessage(remaining <= 0 ? '画像は最大100枚までです。' : '画像ファイルを選択してください。');
      return;
    }

    setImages((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    setMessage(
      accepted.length < files.length
        ? `追加できる上限まで取り込みました（最大${MAX_IMAGES}枚）。`
        : '',
    );
  };

  const remove = (id: string) => {
    setImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    setImages((current) => {
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const clearAll = () => {
    images.forEach((item) => URL.revokeObjectURL(item.url));
    setImages([]);
    setMessage('');
  };

  const createPdf = async () => {
    if (images.length === 0 || busy) return;
    setBusy(true);
    setMessage('PDFを作成しています…');

    try {
      const pdf = await PDFDocument.create();

      for (const item of images) {
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        let embedded;

        if (item.file.type === 'image/png') {
          embedded = await pdf.embedPng(bytes);
        } else if (item.file.type === 'image/jpeg' || item.file.type === 'image/jpg') {
          embedded = await pdf.embedJpg(bytes);
        } else {
          const converted = await convertToJpeg(item.file);
          embedded = await pdf.embedJpg(converted);
        }

        const { width, height } = embedded.scale(1);
        const page = pdf.addPage([width, height]);
        page.drawImage(embedded, { x: 0, y: 0, width, height });
      }

      const output = await pdf.save();
      const pdfBuffer = output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `SnapPDF_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage(`${images.length}枚の画像をPDFにまとめました。`);
    } catch (error) {
      console.error(error);
      setMessage('PDFの作成に失敗しました。JPEGまたはPNG画像で再度お試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>SnapPDF</h1>
          <p style={styles.subtitle}>複数の画像を、1つのPDFにまとめます</p>
        </div>
        <span style={styles.counter}>{images.length} / {MAX_IMAGES}枚</span>
      </header>

      <main style={styles.main}>
        <label style={styles.dropZone}>
          <strong style={{ fontSize: 18 }}>画像を選択</strong>
          <span style={styles.hint}>JPEG・PNGなど／最大100枚</span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              event.currentTarget.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>

        {message && <div style={styles.message}>{message}</div>}

        {images.length > 0 && (
          <>
            <div style={styles.summary}>
              <span>合計 {formatBytes(totalSize)}</span>
              <button type="button" onClick={clearAll} style={styles.textButton}>すべて削除</button>
            </div>

            <div style={styles.grid}>
              {images.map((item, index) => (
                <article key={item.id} style={styles.card}>
                  <img src={item.url} alt={item.file.name} style={styles.image} />
                  <div style={styles.cardBody}>
                    <strong style={styles.fileName}>{index + 1}. {item.file.name}</strong>
                    <span style={styles.fileSize}>{formatBytes(item.file.size)}</span>
                    <div style={styles.actions}>
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} style={styles.smallButton}>←</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === images.length - 1} style={styles.smallButton}>→</button>
                      <button type="button" onClick={() => remove(item.id)} style={styles.deleteButton}>削除</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      {images.length > 0 && (
        <footer style={styles.footer}>
          <button type="button" onClick={createPdf} disabled={busy} style={styles.primaryButton}>
            {busy ? '作成中…' : `${images.length}枚をPDFにする`}
          </button>
        </footer>
      )}
    </div>
  );
}

async function convertToJpeg(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Image conversion failed')), 'image/jpeg', 0.92);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f5f7fb', color: '#172033', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingBottom: 110 },
  header: { position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '16px max(16px, env(safe-area-inset-left))', background: 'rgba(255,255,255,.94)', borderBottom: '1px solid #e4e8f0', backdropFilter: 'blur(12px)' },
  title: { margin: 0, fontSize: 24 },
  subtitle: { margin: '3px 0 0', color: '#667085', fontSize: 13 },
  counter: { background: '#eaf0ff', color: '#2457d6', borderRadius: 999, padding: '7px 11px', fontWeight: 700, whiteSpace: 'nowrap' },
  main: { width: 'min(1000px, calc(100% - 32px))', margin: '24px auto' },
  dropZone: { display: 'grid', placeItems: 'center', gap: 8, minHeight: 150, padding: 24, background: '#fff', border: '2px dashed #9fb6ef', borderRadius: 18, cursor: 'pointer', textAlign: 'center' },
  hint: { color: '#667085', fontSize: 14 },
  message: { marginTop: 14, padding: 12, background: '#fff7d6', border: '1px solid #f4d86c', borderRadius: 10 },
  summary: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '22px 2px 12px', color: '#667085' },
  textButton: { border: 0, background: 'transparent', color: '#d92d20', fontWeight: 700, cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 },
  card: { overflow: 'hidden', background: '#fff', border: '1px solid #e4e8f0', borderRadius: 14, boxShadow: '0 5px 18px rgba(16,24,40,.06)' },
  image: { display: 'block', width: '100%', height: 160, objectFit: 'cover', background: '#eef1f6' },
  cardBody: { display: 'grid', gap: 7, padding: 11 },
  fileName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 },
  fileSize: { color: '#667085', fontSize: 12 },
  actions: { display: 'flex', gap: 7, marginTop: 3 },
  smallButton: { flex: 1, padding: '7px 8px', border: '1px solid #d0d5dd', borderRadius: 8, background: '#fff', cursor: 'pointer' },
  deleteButton: { flex: 2, padding: '7px 8px', border: '1px solid #f2b8b5', borderRadius: 8, background: '#fff5f4', color: '#b42318', cursor: 'pointer' },
  footer: { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10, padding: '12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,.96)', borderTop: '1px solid #e4e8f0', backdropFilter: 'blur(12px)' },
  primaryButton: { display: 'block', width: 'min(600px, 100%)', margin: '0 auto', padding: 15, border: 0, borderRadius: 12, background: '#2f6df6', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer' },
};