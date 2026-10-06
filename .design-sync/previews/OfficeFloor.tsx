import { OfficeFloor, type OfficePerson } from "sub-office";

const at = new Date(2026, 9, 6, 10, 10, 30);

const team: OfficePerson[] = [
  { name: "Jae", team: "Sales", you: true, pile: 2, mood: "working" },
  { name: "Tom", team: "Sales", pile: 11, mood: "working" },
  { name: "Noor", team: "Sales", pile: 1 },
  { name: "Mina", team: "Finance", needsDecision: true },
  { name: "Ana", team: "Finance", status: "offline", pile: 3 },
  { name: "Sofia", team: "Design", pile: 1, mood: "working" },
  { name: "Leo", team: "Design", pile: 2, mood: "happy" },
  { name: "Priya", team: "Design", status: "away" },
];

const twenty: OfficePerson[] = [
  ...team,
  { name: "Ben", team: "Sales" },
  { name: "Ken", team: "Finance", status: "offline", pile: 2 },
  { name: "Yuki", team: "Engineering", pile: 1, mood: "working" },
  { name: "Omar", team: "Engineering", status: "away" },
  { name: "Lena", team: "Engineering" },
  { name: "Raj", team: "Engineering", pile: 4, needsDecision: true },
  { name: "Eva", team: "Engineering", mood: "working" },
  { name: "Sam", team: "Engineering" },
  { name: "Theo", team: "Support", pile: 2, mood: "working" },
  { name: "Rosa", team: "Support" },
  { name: "Ali", team: "Support" },
  { name: "Nina", team: "Support", mood: "talk" },
];

export const Plaza = () => (
  <OfficeFloor
    people={team}
    layout="plaza"
    sky="day"
    now={at}
    assemble={false}
  />
);

export const AskingYou = () => (
  <OfficeFloor
    people={team.map((p) =>
      p.you
        ? {
            ...p,
            mood: "asking",
            needsDecision: true,
            says: "Mina's bot asks for the March invoices. Share all 12?",
          }
        : p,
    )}
    layout="plaza"
    sky="day"
    now={at}
    assemble={false}
  />
);

export const Grid = () => (
  <OfficeFloor
    people={team}
    layout="grid"
    deskStyle="frame"
    sky="day"
    now={at}
    assemble={false}
  />
);

export const TeamRooms = () => (
  <OfficeFloor
    people={twenty}
    layout="rooms"
    sky="evening"
    now={at}
    assemble={false}
  />
);

export const Library = () => (
  <OfficeFloor
    people={team}
    layout="library"
    deskStyle="wood"
    sky="night"
    now={at}
    assemble={false}
  />
);
