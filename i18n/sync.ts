// Languages kept in step by the type checker: a set of words in one language must have exactly the
// keys of its source (English), no fewer and no more, or `pnpm typecheck` fails and names them.
// Used by the screen's messages (messages.ts) and the relay's own pages (features/relay), so a
// language added in one place and forgotten in another never reaches a release. That every
// message takes the same values ({name}, plurals) in each language is checked by
// i18n/messages.test.ts, which the package build runs too.

/** A line of words: text, or text made from values. */
type Line = string | ((...args: never[]) => unknown);

/** Every key path in a tree of words: "a", "b.c", … */
export type Paths<T, Prefix extends string = ""> = T extends Line
  ? never
  : {
      [K in keyof T & string]: T[K] extends Line
        ? `${Prefix}${K}`
        : Paths<T[K], `${Prefix}${K}.`>;
    }[keyof T & string];

/**
 * A language's words when they have exactly the source's keys. Otherwise a type that names the keys
 * missing and the ones left over, so assigning the language to it fails and says which.
 */
export type InSync<Language, Source> = [
  Exclude<Paths<Source>, Paths<Language>>,
  Exclude<Paths<Language>, Paths<Source>>,
] extends [never, never]
  ? Language
  : {
      "keys missing here": Exclude<Paths<Source>, Paths<Language>>;
      "keys not in the source": Exclude<Paths<Language>, Paths<Source>>;
    };

/** Every language of a set of words, keyed by language, in step with its English. */
export type AllInSync<Words extends { en: unknown }> = {
  [Language in keyof Words]: InSync<Words[Language], Words["en"]>;
};
