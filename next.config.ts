import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // On Vercel, don't use standalone output (Vercel handles deployment).
  // On Railway/Render/Docker, use standalone for the custom server.js.
  output: process.env.VERCEL ? undefined : "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
