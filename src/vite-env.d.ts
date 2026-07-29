/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Tesseract.js の読み込み元 URL（OCR） */
  readonly VITE_TESSERACT_URL?: string;
  /** fontkit の読み込み元 URL（日本語フォント埋め込み用・任意） */
  readonly VITE_FONTKIT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
