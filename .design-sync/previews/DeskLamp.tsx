import { DeskLamp } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const OnAndOff = () => (
  <div style={row}>
    <DeskLamp on={false} width={200} assemble={false} />
    <DeskLamp on width={200} assemble={false} />
  </div>
);
