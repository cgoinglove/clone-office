import { TeamSign } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const Signs = () => (
  <div style={row}>
    <TeamSign
      team="Finance"
      working={2}
      free={1}
      width={260}
      assemble={false}
    />
    <TeamSign team="Design" waiting={1} width={260} assemble={false} />
    <TeamSign
      team="Support"
      working={0}
      free={3}
      off={1}
      width={260}
      assemble={false}
    />
  </div>
);
