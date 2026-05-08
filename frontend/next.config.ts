import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin tracing root to this repo so Next.js ignores other lockfiles on the system.
  outputFileTracingRoot: path.join(__dirname, "../"),
};

export default nextConfig;
