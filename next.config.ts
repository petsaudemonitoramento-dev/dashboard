import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/importacoes/pec": ["./src/lib/pec/*.mjs"],
  },
};

export default nextConfig;
