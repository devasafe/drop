/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: false,
  eslint: {
    // ESLint roda separadamente; problemas pre-existentes nao devem bloquear o deploy
    ignoreDuringBuilds: true,
  },
  onDemandEntries: {
    maxInactiveAge: 25000,
    pagesBufferLength: 5,
  },
  webpack: (config, { isServer }) => {
    config.optimization.minimize = !isServer;
    return config;
  },
};

module.exports = nextConfig;
