/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "http://localhost:3000",
    "100.114.178.4",
    "127.0.0.1",
    "https://involvex-claude-router-cloud.involvex.workers.dev",
    "http://localhost:20128",
  ],
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_CLOUD_URL: "https://9router.com",
  },
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Stop watching logs directory to prevent HMR during streaming
    config.watchOptions = {
      ...config.watchOptions,
      ignored: /[\\/](logs|\.next)[\\/]/,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*",
      },
      {
        source: "/v1/v1",
        destination: "/api/v1",
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses",
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*",
      },
      {
        source: "/v1",
        destination: "/api/v1",
      },
    ];
  },
};

export default nextConfig;
