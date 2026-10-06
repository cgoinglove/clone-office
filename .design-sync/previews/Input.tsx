import { Input } from "sub-office";

const col = { display: "grid", gap: 10, width: 320 } as const;

export const States = () => (
  <div style={col}>
    <Input placeholder="Ask your bot to get something from a colleague…" />
    <Input defaultValue="The signed Northwind quote" />
    <Input disabled placeholder="Disabled" />
    <Input aria-invalid defaultValue="not-an-email" />
  </div>
);
