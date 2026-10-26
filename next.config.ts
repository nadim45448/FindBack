import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Type-safe route links. `typedRoutes` is a top-level option in Next 16 —
  // it was `experimental.typedRoutes` in earlier versions.
  typedRoutes: true,
};

export default nextConfig;
