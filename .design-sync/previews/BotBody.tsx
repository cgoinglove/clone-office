import { BotBody } from "sub-office";

export const InsideAnSvg = () => (
  <svg
    className="of"
    viewBox="0 0 560 240"
    width={420}
    overflow="visible"
    role="img"
    aria-label="Two bots"
  >
    <rect x="0" y="200" width="560" height="4" rx="2" fill="var(--gray-100)" />
    <g transform="translate(20 0)">
      <BotBody mood="talk" color="#10a65a" shape="b7" />
    </g>
    <g transform="translate(300 0)">
      <BotBody mood="listening" shape="b113" />
    </g>
  </svg>
);
