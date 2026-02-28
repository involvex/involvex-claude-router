import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output:
    process.env.NEXT_PUBLIC_CLOUD_MODE === "true" ? "export" : "standalone",
  trailingSlash: true, // Helps with static exports on some hosting providers
  allowedDevOrigins: [
    "http://localhost:3000",
    "100.114.178.4",
    "127.0.0.1",
    "https://involvex-claude-router-cloud.involvex.workers.dev",
    "http://localhost:20128",
    "192.168.178.69",
  ],
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_CLOUD_URL: "https://9router.com",
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {},

  webpack: (config, { isServer, dev }) => {
    // Standard standard-compliant fallback for browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
      };
    }

    if (process.env.NEXT_PUBLIC_CLOUD_MODE === "true") {
      // Alias initCloudSync to a no-op stub
      config.resolve.alias["@/lib/initCloudSync"] = path.resolve(
        process.cwd(),
        "src/lib/initCloudSync.stub.js",
      );

      // Disable Webpack filesystem cache to prevent absolute path mapping issues
      config.cache = false;
    }

    return config;
  },
  async rewrites() {
    if (process.env.NEXT_PUBLIC_CLOUD_MODE === "true") {
      return [];
    }
    return [
      { source: "/v1/v1/:path*", destination: "/api/v1/:path*" },
      { source: "/v1/v1", destination: "/api/v1" },
      { source: "/codex/:path*", destination: "/api/v1/responses" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
      { source: "/v1", destination: "/api/v1" },
    ];
  },
};

export default nextConfig;
