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
