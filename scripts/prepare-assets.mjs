/**
 * public/ に必要な静的ファイルを用意するスクリプト。
 *
 * - pdf.js のワーカーファイルを node_modules から public/ へコピーする
 *   （Vite の ?url インポートに依存せず、どの配信環境でも同じパスで読めるようにするため）
 *
 * `npm run dev` / `npm run build` の前に自動実行される。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');

async function main() {
  await mkdir(publicDir, { recursive: true });

  let pdfjsRoot;
  try {
    pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
  } catch {
    console.warn('[prepare-assets] pdfjs-dist が見つかりません。npm install を実行してください。');
    return;
  }

  const source = join(pdfjsRoot, 'build', 'pdf.worker.min.mjs');
  const target = join(publicDir, 'pdf.worker.min.mjs');
  if (!existsSync(source)) {
    console.warn(`[prepare-assets] ${source} が見つかりません。`);
    return;
  }

  const polyfill = `/* polyfill injected by scripts/prepare-assets.mjs */
for (const C of [Map, WeakMap]) {
  if (typeof C.prototype.getOrInsert !== 'function') {
    C.prototype.getOrInsert = function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k); };
  }
  if (typeof C.prototype.getOrInsertComputed !== 'function') {
    C.prototype.getOrInsertComputed = function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); };
  }
}
`;

  const code = await readFile(source, 'utf8');
  await writeFile(target, polyfill + code);
  console.log('[prepare-assets] pdf.worker.min.mjs を public/ に配置しました（ポリフィル付き）');
}

main().catch((error) => {
  console.error('[prepare-assets] 失敗:', error);
  process.exitCode = 1;
});
