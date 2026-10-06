import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  devIndicators: false,
  // AGENTS.md already tells agents to read the installed Next.js docs; without this, every
  // `next dev` appends its own block to AGENTS.md (which CLAUDE.md links to).
  agentRules: false,
};

// The screen's words come from messages/<language>.json, chosen per request in i18n/request.ts.
export default createNextIntlPlugin()(nextConfig);
