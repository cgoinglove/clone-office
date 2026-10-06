import { Laptop } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const States = () => (
  <div style={row}>
    <Laptop
      status="offline"
      width={200}
      assemble={false}
      label="Closed: computer off"
    />
    <Laptop
      status="away"
      working={false}
      width={200}
      assemble={false}
      label="Open"
    />
    <Laptop
      status="active"
      working
      width={200}
      assemble={false}
      label="Working"
    />
  </div>
);
