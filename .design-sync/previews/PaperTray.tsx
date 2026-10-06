import { PaperTray } from "sub-office";

const row = {
  display: "flex",
  gap: 12,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const Piles = () => (
  <div style={row}>
    <PaperTray count={0} width={170} assemble={false} />
    <PaperTray count={3} width={170} assemble={false} />
    <PaperTray count={8} width={170} assemble={false} />
    <PaperTray count={12} width={170} assemble={false} />
  </div>
);
