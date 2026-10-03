import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["swisseph-wasm"],

  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/swisseph-wasm/wasm/**/*"],
  },
};

export default nextConfig;
