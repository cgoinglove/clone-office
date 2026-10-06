// The office and its bots: import `./office.css` once wherever these are drawn.

export { Bot, BotBody, type BotBodyProps, type BotProps } from "./bot";
export { BOT_SHAPES, type BotShape, MOODS, type Mood } from "./bot-shape";
export {
  Bookshelf,
  CoffeeCorner,
  type CoffeeCornerProps,
  DecisionBoard,
  type DecisionBoardProps,
  Desk,
  DeskChair,
  DeskLamp,
  type DeskLampProps,
  type DeskProps,
  Laptop,
  type LaptopProps,
  Lift,
  type LiftProps,
  Lounge,
  MeetingRoom,
  OfficeCorner,
  type OfficeCornerProps,
  OfficeScreen,
  type OfficeScreenProps,
  PaperTray,
  type PaperTrayProps,
  type PieceProps,
  PingPongTable,
  type PingPongTableProps,
  Plant,
  type PlantProps,
  TeamSign,
  type TeamSignProps,
  WallCalendar,
  type WallCalendarProps,
  WallClock,
  type WallClockProps,
} from "./objects";
export {
  FLOOR_WORDS,
  type FloorWords,
  floorCount,
  OfficeFloor,
  type OfficeFloorProps,
  type OfficePerson,
} from "./office-floor";
export type {
  BoardCard,
  DeskItem,
  DeskStyle,
  PlantKind,
  ScreenStats,
  Sky,
  Status,
} from "./pieces";
export type { Layout } from "./plan";
