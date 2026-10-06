import { ShinyText } from "sub-office";

const col = { display: "grid", gap: 10, font: "14px var(--of-sans)" } as const;

export const Tones = () => (
  <div style={col}>
    <ShinyText text="Asking Mina's bot for the March invoices…" />
    <ShinyText tone="waiting" text="Waiting on your decision" />
    <ShinyText tone="reading" text="Reading the Northwind thread" />
  </div>
);
