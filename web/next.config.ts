import type { NextConfig } from "next";
import path from "node:path";

// GitHub Pages serves the site under /<repo>/; the workflow sets NEXT_PUBLIC_BASE_PATH accordingly.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@pd3/engine"],
  // @pd3/engine is linked from ../engine (TypeScript source); Turbopack needs the repo root to resolve it.
  turbopack: { root: path.join(__dirname, "..") },
};

export default nextConfig;
