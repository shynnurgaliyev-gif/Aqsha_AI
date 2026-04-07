import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // output: 'standalone' is needed for Docker builds but causes symlink errors
  // on Windows. Enable this when adding a Dockerfile for admin-web.
};

export default nextConfig;
