import { Bot } from "sub-office";

const row = {
  display: "flex",
  gap: 20,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;
const cell = {
  display: "grid",
  justifyItems: "center",
  gap: 6,
  font: "500 11px var(--of-mono)",
  color: "var(--muted-foreground)",
} as const;

const moods = [
  ["idle", "Free"],
  ["working", "Working"],
  ["talk", "Talking"],
  ["listening", "Listening"],
  ["surprised", "Work landed"],
  ["asking", "Needs you"],
  ["happy", "Done"],
  ["sleep", "Computer off"],
] as const;

export const Moods = () => (
  <div style={row}>
    {moods.map(([mood, label]) => (
      <div key={mood} style={cell}>
        <Bot mood={mood} size={72} />
        {label}
      </div>
    ))}
  </div>
);

export const Colleagues = () => (
  <div style={row}>
    <Bot size={72} color="#10a65a" shape="b7" />
    <Bot size={72} color="#8B5CF6" shape="b23" mood="working" />
    <Bot size={72} color="#EC4899" shape="heart" mood="happy" />
    <Bot size={72} color="#0098dc" shape="squircle" mood="talk" />
    <Bot size={72} color="#6366F1" shape="b58" mood="asking" mine={false} />
    <Bot size={72} color="#00a190" shape="b77" mood="sleep" />
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <Bot size={24} />
    <Bot size={40} />
    <Bot size={64} />
    <Bot size={120} mood="happy" />
  </div>
);
