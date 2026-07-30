# SnapPDF

複数画像を最大100枚までまとめてPDF化できるPWAアプリです。

## 主な機能

- 画像の複数選択、並び替え、回転、トリミング
- A4・A3・B5・Letter・元画像サイズへのPDF出力
- PDFの保存、共有、印刷、圧縮、結合、分割
- OCR、自動補正、ダークモード、オフライン利用
- すべての処理をブラウザ内で実行

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

`main`ブランチへpushすると、GitHub ActionsからGitHub Pagesへ自動デプロイされます。

---

## 同梱アプリ

- [`keyshift/`](./keyshift) — **KeyShift**（カラオケ練習プレイヤー）。端末内の音楽ファイルを、テンポを変えずに半音単位でキー変更して再生できます。SnapPDFとは独立したNext.jsアプリです。

`main`へのpush時に、SnapPDFはこれまでどおりPagesのルートへ、KeyShiftは`/keyshift/`配下へ同時にデプロイされます。

| アプリ | 公開先 |
|---|---|
| SnapPDF | `https://<ユーザー名>.github.io/snappdf/` |
| KeyShift | `https://<ユーザー名>.github.io/snappdf/keyshift/` |
