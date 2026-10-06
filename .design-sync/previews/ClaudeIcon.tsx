import { ClaudeIcon } from "sub-office";

const row = { display: "flex", gap: 16, alignItems: "center" } as const;

export const Sizes = () => (
  <div style={row}>
    <ClaudeIcon className="size-4" />
    <ClaudeIcon className="size-6" />
    <ClaudeIcon className="size-10" />
  </div>
);
