import { Button } from "sub-office";

const row = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} as const;

export const Variants = () => (
  <div style={row}>
    <Button>Send request</Button>
    <Button variant="brand">Approve</Button>
    <Button variant="outline">Not yet</Button>
    <Button variant="secondary">Ask later</Button>
    <Button variant="ghost">Skip</Button>
    <Button variant="destructive">Remove access</Button>
    <Button variant="link">See the thread</Button>
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button>Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const States = () => (
  <div style={row}>
    <Button loading>Sending</Button>
    <Button disabled>Disabled</Button>
    <Button variant="brand" loading>
      Approving
    </Button>
  </div>
);
