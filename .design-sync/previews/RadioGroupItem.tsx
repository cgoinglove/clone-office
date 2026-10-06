import { RadioGroup, RadioGroupItem } from "sub-office";

const row = { display: "flex", gap: 12, alignItems: "center" } as const;

export const InAGroup = () => (
  <RadioGroup defaultValue="b">
    <div style={row}>
      <RadioGroupItem value="a" aria-label="Unpicked" />
      <RadioGroupItem value="b" aria-label="Picked" />
      <RadioGroupItem value="c" disabled aria-label="Disabled" />
    </div>
  </RadioGroup>
);
