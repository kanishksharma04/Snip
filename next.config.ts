import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.join(import.meta.dirname ?? process.cwd());

const nextConfig: NextConfig = {
  // An unrelated package-lock.json in the parent home directory makes Next.js
  // misdetect the workspace root; pin it explicitly to this project.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
