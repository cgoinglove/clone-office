import { GrokIcon } from "sub-office";

const row = { display: "flex", gap: 16, alignItems: "center" } as const;

export const Sizes = () => (
  <div style={row}>
    <GrokIcon className="size-4" />
    <GrokIcon className="size-6" />
    <GrokIcon className="size-10" />
  </div>
);
