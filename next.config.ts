import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The sample CSVs are read from disk by the import route at runtime, so they
  // have to be traced into the serverless bundle explicitly.
  outputFileTracingIncludes: {
    "/api/import": ["./data/**"],
  },
  /* config options here */
};

export default nextConfig;
