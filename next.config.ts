import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  // Quick tunnels get a random *.trycloudflare.com host on every restart; the
  // dev server blocks its own HMR/dev assets for unknown origins otherwise.
  // The LAN host is allowed too, so opening the dev server from a phone/tablet
  // does not make API requests (e.g. /api/auth/session) answer with HTML.
  allowedDevOrigins: ["*.trycloudflare.com", "localhost", "http://172.18.48.1:3001"],
};

export default nextConfig;
