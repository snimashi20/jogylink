import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @jogylink/ui ships TypeScript source, so Next compiles it together with the app.
  transpilePackages: ['@jogylink/ui'],
};

export default nextConfig;
