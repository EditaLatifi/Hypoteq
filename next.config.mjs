/**
 * The Auskunftsermächtigung templates (de/en/fr/it). lib/funnel-v3/authorization.ts reads them
 * with fs from public/documents; on Vercel `public` is served by the CDN and is not part of a
 * serverless function unless it is traced in — for every route that builds the prefilled PDF:
 * the download in the closing, the confirmation mail (/api/inquiry), the reminders (cron) and
 * the Nachreich page.
 */
const AUTHORIZATION_TEMPLATES = [
  './public/documents/HYPOTEQ_Auskunftsermaechtigung_DE.pdf',
  './public/documents/HYPOTEQ_Auskunftsermaechtigung_EN.pdf',
  './public/documents/HYPOTEQ_Auskunftsermaechtigung_FR.pdf',
  './public/documents/HYPOTEQ_Auskunftsermaechtigung_IT.pdf',
];

/**
 * The forms before HYPOTEQ's templates of 21.10.2026: links in older mails and on other sites
 * lead to the current form instead of a 404 or an outdated one.
 */
const AUTHORIZATION_LEGACY = {
  '/documents/Auskunftsermaechtigung-1.pdf': '/documents/HYPOTEQ_Auskunftsermaechtigung_DE.pdf',
  '/documents/20250711_HYPOTEQ-Authorisation-for-information-1.pdf': '/documents/HYPOTEQ_Auskunftsermaechtigung_EN.pdf',
  '/documents/20250711_HYPOTEQ-Pouvoir-dinformation-1-1.pdf': '/documents/HYPOTEQ_Auskunftsermaechtigung_FR.pdf',
  '/documents/HYPOTEQ-Pouvoir-dinformation-1-1.pdf': '/documents/HYPOTEQ_Auskunftsermaechtigung_FR.pdf',
  '/documents/20250711_HYPOTEQ-Procura-per-informazioni-1.pdf': '/documents/HYPOTEQ_Auskunftsermaechtigung_IT.pdf',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000, // 1 year
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['@/components', '@/hooks', '@/lib'],
    // Route globs (matched anywhere in the route name); no `[token]` — brackets are glob syntax.
    outputFileTracingIncludes: {
      '/api/funnel/authorization': AUTHORIZATION_TEMPLATES,
      '/api/inquiry': AUTHORIZATION_TEMPLATES,
      '/api/portal/cron': AUTHORIZATION_TEMPLATES,
      '/api/nachreichen/**': AUTHORIZATION_TEMPLATES,
    },
  },

  // Compression
  compress: true,

  // Production optimizations
  productionBrowserSourceMaps: false,
  
  // Redirects (legacy URLs)
  async redirects() {
    return [
      {
        source: "/betterhome",
        destination: "/de/betterhomes",
        permanent: true,
      },
      {
        source: "/remax",
        destination: "/de/remax",
        permanent: true,
      },
      {
        source: "/geldberatung",
        destination: "/de/kuehnis_geldberatung",
        permanent: true,
      },
      {
        source: "/kuehnis_geldberatung",
        destination: "/de/kuehnis_geldberatung",
        permanent: true,
      },
      ...Object.entries(AUTHORIZATION_LEGACY).map(([source, destination]) => ({ source, destination, permanent: true })),
    ];
  },

  // Headers for caching and performance
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
