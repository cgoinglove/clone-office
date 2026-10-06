import { PingPongTable } from "sub-office";

export const Rally = () => <PingPongTable rally width={400} assemble={false} />;

export const Idle = () => (
  <PingPongTable rally={false} width={400} assemble={false} />
);
