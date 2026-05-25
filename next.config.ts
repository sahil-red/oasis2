import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.zeptonow.com" },
      { protocol: "https", hostname: "cdn.zeptonow.com" },
      { protocol: "https", hostname: "cdn.grofers.com" },
      { protocol: "https", hostname: "**.grofers.com" },
      { protocol: "https", hostname: "**.blinkit.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "images.openfoodfacts.org" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
