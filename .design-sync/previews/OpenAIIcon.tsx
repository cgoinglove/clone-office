import { OpenAIIcon } from "sub-office";

const row = { display: "flex", gap: 16, alignItems: "center" } as const;

export const Sizes = () => (
  <div style={row}>
    <OpenAIIcon className="size-4" />
    <OpenAIIcon className="size-6" />
    <OpenAIIcon className="size-10" />
  </div>
);
