// How much of a profile is kept (server/profile.ts) and offered on the screens that edit it, in
// one place with no imports, so the page never takes more than the server keeps.
export const PROFILE_LIMITS = {
  role: 200,
  owns: 4,
  own: 80,
  tools: 6,
  tool: 40,
} as const;
