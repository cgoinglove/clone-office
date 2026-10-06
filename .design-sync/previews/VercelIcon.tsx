import { VercelIcon } from "sub-office";

const row = { display: "flex", gap: 16, alignItems: "center" } as const;

export const Sizes = () => (
  <div style={row}>
    <VercelIcon className="size-4" />
    <VercelIcon className="size-6" />
    <VercelIcon className="size-10" />
  </div>
);
