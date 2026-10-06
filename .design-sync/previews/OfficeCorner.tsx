import { OfficeCorner } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const TimesOfDay = () => (
  <div style={row}>
    <OfficeCorner sky="day" width={300} assemble={false} />
    <OfficeCorner sky="evening" width={300} assemble={false} />
    <OfficeCorner sky="night" width={300} assemble={false} />
  </div>
);
