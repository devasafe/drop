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
  // ✅ SEGURANÇA: headers de proteção em todas as respostas do frontend.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Força HTTPS (HSTS) — só tem efeito em produção sob HTTPS
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Anti-clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Impede MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Não vazar URL completa em referer cross-origin
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restringe APIs sensíveis do browser (geolocation liberada só p/ o próprio site)
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
