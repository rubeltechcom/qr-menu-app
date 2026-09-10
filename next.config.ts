import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces the files the server actually needs into .next/standalone, so
  // the Docker image ships that instead of the whole node_modules tree.
  output: "standalone",

  // No images.remotePatterns on purpose. Uploaded dish photos are served
  // same-origin under /api/uploads by the local storage driver, and an
  // S3 install's bucket hostname is not known at build time — a wildcard
  // pattern would turn the image optimizer into an open proxy for any
  // host. The menu renders photos with plain <img>; see
  // src/modules/storage/ for the reasoning.
};

export default nextConfig;
