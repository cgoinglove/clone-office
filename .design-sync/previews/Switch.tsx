import { Switch } from "sub-office";

const row = { display: "flex", gap: 16, alignItems: "center" } as const;

export const States = () => (
  <div style={row}>
    <Switch defaultChecked aria-label="On" />
    <Switch aria-label="Off" />
    <Switch size="sm" defaultChecked aria-label="Small on" />
    <Switch disabled aria-label="Disabled" />
  </div>
);
