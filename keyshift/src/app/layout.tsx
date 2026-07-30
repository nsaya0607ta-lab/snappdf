import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KeyShift — カラオケ練習プレイヤー',
  description:
    '端末内の音楽ファイルだけを使い、テンポを変えずにキーを半音単位で変更できるカラオケ練習用プレイヤー。すべてブラウザ内で処理し、アップロードは行いません。',
  applicationName: 'KeyShift',
  appleWebApp: { capable: true, title: 'KeyShift', statusBarStyle: 'black-translucent' },
  manifest: './manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#08080b' },
  ],
};

/** テーマのちらつきを防ぐため、描画前にクラスを当てる */
const themeScript = `(function(){try{var t=localStorage.getItem('keyshift-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
