import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allowed cross-origin dev hosts come from the environment, so the
  // preview hostname is never baked into tracked config.
  allowedDevOrigins: process.env.DEV_ALLOWED_ORIGIN
    ? [process.env.DEV_ALLOWED_ORIGIN]
    : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
