/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * pdf.js must not be bundled.
   *
   * It loads its worker at runtime by importing `pdf.worker.mjs` from
   * alongside itself. Bundled into a server chunk, "alongside itself" becomes
   * `.next/server/chunks/`, where no such file exists — so every PDF import on
   * Vercel died with:
   *
   *   Setting up fake worker failed: Cannot find module
   *   '/var/task/.next/server/chunks/pdf.worker.mjs'
   *
   * Left external, it is required from node_modules at runtime with the worker
   * sitting next to it, which is what it expects.
   *
   * This never showed up locally: `next dev` does not bundle server code the
   * same way, and the Week 0 games were loaded from seed.sql rather than
   * through this route, so the parser had never actually run on the server.
   */
  serverExternalPackages: ["pdfjs-dist"],

  /**
   * The embeds, and only the embeds, may be framed.
   *
   * Nothing sets X-Frame-Options here today, so an iframe would work by
   * accident — which is exactly the kind of thing that stops working on
   * somebody else's site the day a security header is added and nobody
   * connects the two. Saying it explicitly makes the permission a decision
   * rather than an oversight, and scoping it to /embed leaves the rest of the
   * site to whatever posture it is given later.
   *
   * `frame-ancestors *` because the point is to be embeddable on sites we do
   * not know the names of. Narrow it to specific origins here if that ever
   * stops being true.
   */
  async headers() {
    return [
      {
        source: "/embed/:path*",
        // Only CSP. `X-Frame-Options` has no "allow anyone" value — ALLOWALL
        // is folklore, not spec, and browsers ignore it — and where both are
        // present the CSP wins anyway. Setting an invalid header to mean
        // "permitted" is worse than setting none.
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },

  /**
   * The worker is reached by dynamic import, so tracing cannot see it from the
   * call site. Named explicitly to guarantee it ships in the function bundle.
   */
  outputFileTracingIncludes: {
    "/api/admin/import/schedule": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
};

export default nextConfig;
