import { CoffeeCorner } from "sub-office";

export const Island = () => (
  <CoffeeCorner island brewing width={400} assemble={false} />
);

export const AgainstTheWall = () => (
  <CoffeeCorner island={false} brewing={false} width={360} assemble={false} />
);
