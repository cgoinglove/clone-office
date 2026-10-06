// Turning text into search terms that work for Korean, Chinese and Japanese as well as for
// space-separated languages. SQLite's unicode61 tokenizer keeps a run of Hangul as one token, so
// "메일" never matches inside "미팅메일은"; its trigram tokenizer needs three characters, so two-
// character words (메일, 회의, 보고) cannot be searched at all. Hermes Agent solved this with a
// tokenizer that re-emits CJK runs as overlapping two-character pieces (native/fts5_cjk, after
// Lucene's CJKAnalyzer). The same rule is applied here in code, before text reaches SQLite, so no
// native extension has to be built for each platform:
//   - a word is split into CJK runs and other runs;
//   - a CJK run of two or more characters becomes its overlapping bigrams ("미팅메일" → 미팅 팅메 메일);
//   - a single CJK character stays as it is; other runs are lower-cased and kept whole.
// A query word becomes the phrase of its pieces, which matches exactly that substring.

const CJK =
  /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uA960-\uA97F\uAC00-\uD7A3\uD7B0-\uD7FF\uF900-\uFAFF]/u;
/** Letters and digits in any script; everything else separates words. */
const WORD = /[\p{L}\p{N}]+/gu;

function pieces(word: string): string[] {
  const out: string[] = [];
  let run = "";
  let cjk = false;
  const flush = () => {
    if (!run) return;
    if (cjk) {
      const chars = [...run];
      if (chars.length === 1) out.push(chars[0]);
      else
        for (let i = 0; i + 1 < chars.length; i++)
          out.push(chars[i] + chars[i + 1]);
    } else out.push(run.toLocaleLowerCase());
    run = "";
  };
  for (const char of word) {
    const isCjk = CJK.test(char);
    if (run && isCjk !== cjk) flush();
    cjk = isCjk;
    run += char;
  }
  flush();
  return out;
}

/** The terms a text is indexed under, space-separated for SQLite's unicode61 tokenizer. */
export function indexTerms(text: string): string {
  const out: string[] = [];
  for (const word of text.normalize("NFC").match(WORD) ?? [])
    out.push(...pieces(word));
  return out.join(" ");
}

/**
 * An FTS5 MATCH expression for what the person or the model typed: every word must appear (as a
 * substring for CJK words, as a word or word prefix otherwise). Undefined when nothing is left to
 * search for. Terms are always quoted, so the query cannot inject FTS5 syntax.
 */
export function matchQuery(query: string): string | undefined {
  const clauses: string[] = [];
  for (const word of query.normalize("NFC").match(WORD) ?? []) {
    const parts = pieces(word);
    if (!parts.length) continue;
    // Pieces are letters and digits only, so they never carry a quote.
    const phrase = `"${parts.join(" ")}"`;
    // A word of several pieces is one FTS5 phrase: its pieces must sit side by side, which is
    // substring matching for CJK. A single Latin word also matches as a prefix (report → reports).
    clauses.push(parts.length === 1 && !CJK.test(word) ? `${phrase}*` : phrase);
  }
  return clauses.length
    ? clauses.map((clause) => `(${clause})`).join(" AND ")
    : undefined;
}

/** The query's words as plain lower-case strings, for finding where a match sits in a text. */
export function queryWords(query: string): string[] {
  return (query.normalize("NFC").match(WORD) ?? []).map((word) =>
    word.toLocaleLowerCase(),
  );
}
