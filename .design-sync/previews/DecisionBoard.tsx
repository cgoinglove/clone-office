import { DecisionBoard } from "sub-office";

export const WaitingOnPeople = () => (
  <DecisionBoard
    cards={[
      { name: "Jae", mine: true },
      { name: "Mina" },
      { name: "Leo" },
      { name: "Raj" },
    ]}
    width={520}
    assemble={false}
  />
);

export const Empty = () => (
  <DecisionBoard cards={[]} width={520} assemble={false} />
);
