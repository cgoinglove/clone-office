import { Desk } from "sub-office";

const row = {
  display: "flex",
  gap: 16,
  alignItems: "flex-end",
  flexWrap: "wrap",
} as const;

export const AtTheDesk = () => (
  <Desk status="active" pile={3} width={420} assemble={false} />
);

export const Statuses = () => (
  <div style={row}>
    <Desk status="active" pile={2} width={230} assemble={false} />
    <Desk
      status="away"
      pile={5}
      mine={false}
      botColor="#8B5CF6"
      botShape="b23"
      width={230}
      assemble={false}
    />
    <Desk
      status="offline"
      pile={12}
      mine={false}
      botColor="#0098dc"
      botShape="squircle"
      width={230}
      assemble={false}
    />
  </div>
);

export const Styles = () => (
  <div style={row}>
    <Desk deskStyle="panel" item="mug" width={230} assemble={false} />
    <Desk deskStyle="frame" item="plant" width={230} assemble={false} />
    <Desk deskStyle="wood" item="books" width={230} assemble={false} />
  </div>
);

export const NeedsYou = () => (
  <Desk status="active" mood="asking" pile={1} width={420} assemble={false} />
);
