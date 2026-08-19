import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.100.43",
    "localhost",
    "127.0.0.1",
  ],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
