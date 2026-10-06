import { Swatch } from "sub-office";

const row = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  width: 260,
} as const;

export const BotColours = () => (
  <div style={row}>
    <Swatch color={null} picked onPick={() => {}} />
    <Swatch color="#10a65a" picked={false} onPick={() => {}} />
    <Swatch color="#8B5CF6" picked={false} onPick={() => {}} />
    <Swatch color="#EC4899" picked={false} onPick={() => {}} />
    <Swatch color="#0098dc" picked={false} onPick={() => {}} />
    <Swatch color="#6366F1" picked={false} onPick={() => {}} />
    <Swatch
      background="linear-gradient(135deg, #10a65a, #0098dc)"
      label="Gradient"
      picked={false}
      onPick={() => {}}
    />
  </div>
);
