/**
 * GitHub Pages のようにサブパス配信する場合は、ビルド時に
 * NEXT_PUBLIC_BASE_PATH=/snappdf/keyshift のように渡す。
 * 未指定ならルート配信（ローカル開発・単体ホスティング）。
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, '') ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 端末内で完結するアプリなので、静的書き出しにしてサーバーを不要にする。
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
