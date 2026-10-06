import { Plant } from "sub-office";

const row = {
  display: "flex",
  gap: 20,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const Kinds = () => (
  <div style={row}>
    <Plant kind="small" assemble={false} />
    <Plant kind="leafy" assemble={false} />
    <Plant kind="tall" assemble={false} />
  </div>
);
