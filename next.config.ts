import type { NextConfig } from "next";

const isProduction =
  process.env.NODE_ENV === "production";

/* CSP básica. O Next.js injeta scripts inline na hidratação,
   por isso 'unsafe-inline'; o 'unsafe-eval' só é necessário
   para o Fast Refresh do `next dev`. 'wasm-unsafe-eval' é
   usado pelo layout do @react-pdf/renderer. Blob e data
   cobrem as imagens e downloads gerados no navegador
   (PDF, Ishikawa e exportações). */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isProduction ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  /* HSTS só faz sentido atrás de HTTPS (Caddy em produção). */
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  /* Gera .next/standalone/server.js para a imagem Docker. */
  output: "standalone",

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
