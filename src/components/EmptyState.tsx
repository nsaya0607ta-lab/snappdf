/** 画像未選択のときに表示する取り込み画面 */

import { MAX_PAGES } from '../constants';
import { IconCamera, IconDocument, IconImages } from './icons';

interface EmptyStateProps {
  dragActive: boolean;
  onPickPhotos: () => void;
  onPickFiles: () => void;
  onOpenCamera: () => void;
}

export function EmptyState({ dragActive, onPickPhotos, onPickFiles, onOpenCamera }: EmptyStateProps) {
  return (
    <div className={`dropzone${dragActive ? ' dropzone--active' : ''}`}>
      <div className="dropzone__icon">
        <IconImages size={30} />
      </div>
      <h2 className="dropzone__title">画像を選んで PDF にまとめましょう</h2>
      <p className="dropzone__text">
        最大 {MAX_PAGES} 枚まで選べます。PDF ファイルを選ぶと、そのページも一緒にまとめられます。
        ここにドラッグ＆ドロップすることもできます。
      </p>
      <div className="dropzone__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={onPickPhotos}>
          <IconImages size={18} />
          写真を選ぶ
        </button>
        <button type="button" className="btn btn--lg" onClick={onOpenCamera}>
          <IconCamera size={18} />
          カメラで撮る
        </button>
        <button type="button" className="btn btn--lg" onClick={onPickFiles}>
          <IconDocument size={18} />
          ファイルを選ぶ
        </button>
      </div>
    </div>
  );
}
