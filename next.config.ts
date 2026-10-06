import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // AGENTS.md already tells agents to read the installed Next.js docs; without this, every
  // `next dev` appends its own block to AGENTS.md (which CLAUDE.md links to).
  agentRules: false,
};

export default nextConfig;
