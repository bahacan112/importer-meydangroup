import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Büyük dosya yüklemeleri için sınırı artırıyoruz
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
