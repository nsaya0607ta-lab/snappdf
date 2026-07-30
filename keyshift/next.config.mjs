/** @type {import('next').NextConfig} */
const nextConfig = {
  // 端末内で完結するアプリなので、静的書き出しにしてサーバーを不要にする。
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
