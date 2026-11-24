import type { NextConfig } from "next";

/**
 * G6 — old WordPress / Tutor LMS certificate links (already printed on certificates and shared):
 *   /tutor-certificate/?cert_hash=<code>, /tutor-certificate-2/?cert_hash=<code>,
 *   /tutor-certificate-verification/?cert_hash=<code>  (and /?cert_hash=<code>)
 * → /verify/<code>. The 1,936 migrated certificates keep the Tutor cert_hash as verification_id.
 */
const CERT_HASH = { type: "query" as const, key: "cert_hash", value: "(?<hash>[0-9A-Za-z]{6,64})" };
const legacyCertificateRedirects = [
  "/tutor-certificate",
  "/tutor-certificate/",
  "/tutor-certificate-2",
  "/tutor-certificate-2/",
  "/tutor-certificate-verification",
  "/tutor-certificate-verification/",
  "/",
].map((source) => ({
  source,
  has: [CERT_HASH],
  destination: "/verify/:hash",
  permanent: true,
}));

/** Security headers for every response. (No strict CSP yet: the VdoCipher player iframe and inline styles need a tested policy first.) */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  // a second local dev server (tests) can use its own build folder; unset everywhere else
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  async redirects() {
    return legacyCertificateRedirects;
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Migrated WordPress media never change: let browsers and the CDN keep them for 30 days.
      {
        source: "/legacy-uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=86400" }],
      },
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, s-maxage=2592000" }],
      },
    ];
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000,
    remotePatterns: [
      { protocol: "https", hostname: "laambad.online", pathname: "/**" },
      { protocol: "https", hostname: "www.laambad.online", pathname: "/**" },
      { protocol: "https", hostname: "lmresource.s3.ap-south-1.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/**" },
      { protocol: "http", hostname: "localhost", pathname: "/**" },
      { protocol: "https", hostname: "localhost", pathname: "/**" },
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
      { protocol: "https", hostname: "*.neon.tech", pathname: "/**" },
    ],
  },
};

export default nextConfig;
