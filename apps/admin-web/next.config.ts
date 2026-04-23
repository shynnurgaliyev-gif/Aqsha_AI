import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 'standalone' output needed for Docker/Render — causes EPERM on Windows due to symlinks.
  // Enabled automatically in Dockerfile via NEXT_OUTPUT env var.
  ...(process.env['NEXT_OUTPUT'] === 'standalone' ? { output: 'standalone' } : {}),
  // NEXT_PUBLIC_API_URL must be set at build time — it's inlined into the JS bundle.
  // Set it in Render to the bot-api service URL (e.g. https://aqsha-ai-bot-api.onrender.com)
};

export default nextConfig;
