import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // No on-screen dev badge (it would show in screenshots and the demo video); errors still surface.
  devIndicators: false,
  partialPrefetching: true,
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "@paypal/agent-toolkit"],
};

export default nextConfig;
