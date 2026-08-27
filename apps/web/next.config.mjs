const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@ils/ui', '@ils/types', '@ils/config'],
  async rewrites() {
    // Same-origin proxy to the backend: keeps admin cookies first-party and
    // avoids CORS entirely. WebSocket connects directly (NEXT_PUBLIC_WS_URL).
    return [{ source: '/api/:path*', destination: `${API_PROXY_TARGET}/api/:path*` }];
  },
};

export default nextConfig;
