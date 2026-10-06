import { Label, RadioGroup, RadioGroupItem } from "sub-office";

const item = { display: "flex", gap: 8, alignItems: "center" } as const;

export const Trust = () => (
  <RadioGroup defaultValue="report">
    <div style={item}>
      <RadioGroupItem value="ask" id="t-ask" />
      <Label htmlFor="t-ask">Ask me first</Label>
    </div>
    <div style={item}>
      <RadioGroupItem value="report" id="t-report" />
      <Label htmlFor="t-report">Act, then tell me</Label>
    </div>
    <div style={item}>
      <RadioGroupItem value="alone" id="t-alone" />
      <Label htmlFor="t-alone">Act alone</Label>
    </div>
  </RadioGroup>
);
