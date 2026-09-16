/**
 * Pinyin matching for people and departments (contract: directory pinyin).
 *
 * The enterprise directory carries two extra columns next to every person's and
 * department's `name`: `namePinyin` (full pinyin, lowercase, no separators —
 * `huyuqina`) and `namePinyinInitials` (`hyqa`). Server-backed lists search them
 * in the backend; **in-memory** lists (an unpaginated table, a picker dialog, a
 * tree select, a header funnel's search box) all go through this one function,
 * so "search a person" means the same thing in every host.
 *
 * Rules:
 * - an empty keyword matches everything (filtering by nothing is not filtering);
 * - a keyword of only ASCII letters / digits / spaces drops its spaces and is
 *   tried as a substring of the full pinyin, the initials **and** the name —
 *   the name too, because names like「胡玉琴A」carry latin characters themselves;
 * - a keyword with any non-ASCII character (i.e. CJK) is matched against the
 *   name only: the pinyin columns never contain Chinese.
 *
 * Rows whose pinyin columns are missing (an older endpoint, a not-yet-backfilled
 * record) fall back to the name, so nobody disappears from a list.
 *
 * Pure and React-free — usable from a column decorator, a `filter` callback or a
 * plain array filter.
 */

/** Anything that can be matched by pinyin: the name is required, both pinyin columns may be absent. */
export interface PersonQuerySubject {
  name: string;
  namePinyin?: string | null;
  namePinyinInitials?: string | null;
}

/** Only an all-ASCII keyword is allowed to touch the pinyin columns. */
const LATIN_QUERY = /^[a-z0-9 ]+$/;

/** Keyword normalisation: trim + lowercase (the pinyin columns are lowercase already). */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Does this keyword hit this person / department? */
export function matchesPersonQuery(query: string, subject: PersonQuerySubject): boolean {
  const needle = normalizeQuery(query);
  if (!needle) return true;
  const name = subject.name.toLowerCase();
  if (!LATIN_QUERY.test(needle)) return name.includes(needle);
  // "hu yu qin" and "huyuqin" must be the same search — the pinyin columns hold no spaces.
  const spaceless = needle.replaceAll(" ", "");
  const pinyin = (subject.namePinyin ?? "").toLowerCase();
  const initials = (subject.namePinyinInitials ?? "").toLowerCase();
  if (spaceless && (pinyin.includes(spaceless) || initials.includes(spaceless))) return true;
  return name.includes(needle);
}
