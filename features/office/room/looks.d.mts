/** Each colleague's clone colour, by place in the relay's list of members. */
export const PALETTE: string[];
export const SHAPE_KEYS: string[];

/** A clone's colour (by place in the relay's list), shape and paint. */
export function looksOf(
  person: { id: string; mine?: boolean },
  index?: number,
): {
  color: string;
  shape: string;
  paint: string | null;
};
