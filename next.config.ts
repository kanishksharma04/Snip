import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // An unrelated package-lock.json in the parent home directory makes Next.js
  // misdetect the workspace root; pin it explicitly to this project.
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
