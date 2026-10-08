// Shapes the mini-me's server code shares.

/** An app and how much it is used, as far as the system records it. */
export interface AppUse {
  name: string;
  /** Days it was used in the last 30. */
  days?: number;
  /** Times it was opened in all. */
  uses?: number;
  /** Minutes it was in front. */
  minutes?: number;
  lastUsedAt?: string;
}
