import { WallCalendar } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const Days = () => (
  <div style={row}>
    <WallCalendar date={new Date(2026, 9, 6)} width={150} assemble={false} />
    <WallCalendar date={new Date(2026, 11, 1)} width={150} assemble={false} />
  </div>
);
