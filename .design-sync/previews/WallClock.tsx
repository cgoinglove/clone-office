import { WallClock } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const TenPastTen = () => (
  <WallClock
    time={new Date(2026, 9, 6, 10, 10, 30)}
    width={200}
    assemble={false}
  />
);

export const Times = () => (
  <div style={row}>
    <WallClock
      time={new Date(2026, 9, 6, 9, 0, 0)}
      width={150}
      assemble={false}
    />
    <WallClock
      time={new Date(2026, 9, 6, 13, 45, 15)}
      width={150}
      assemble={false}
    />
    <WallClock
      time={new Date(2026, 9, 6, 18, 20, 50)}
      width={150}
      assemble={false}
    />
  </div>
);
