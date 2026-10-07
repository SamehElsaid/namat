import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@namat/ui", "@namat/shared"],
  reactStrictMode: true,
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3302";
    return [
      { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
      { source: "/uploads/:path*", destination: `${api}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
