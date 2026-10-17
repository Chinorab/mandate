import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
