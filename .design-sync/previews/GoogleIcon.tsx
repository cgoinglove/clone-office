import { GoogleIcon } from "sub-office";

const row = { display: "flex", gap: 16, alignItems: "center" } as const;

export const Sizes = () => (
  <div style={row}>
    <GoogleIcon className="size-4" />
    <GoogleIcon className="size-6" />
    <GoogleIcon className="size-10" />
  </div>
);
