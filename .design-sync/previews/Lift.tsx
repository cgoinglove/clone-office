import { Lift } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const ShutAndOpen = () => (
  <div style={row}>
    <Lift
      open={0}
      floor={1}
      time={new Date(2026, 9, 6, 10, 10, 30)}
      width={280}
      assemble={false}
    />
    <Lift
      open={1}
      floor={2}
      time={new Date(2026, 9, 6, 10, 10, 30)}
      width={280}
      assemble={false}
    />
  </div>
);
