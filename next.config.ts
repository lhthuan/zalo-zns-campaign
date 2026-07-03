import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — an unrelated package-lock.json in the user's home
  // directory otherwise makes Turbopack misdetect the monorepo root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
