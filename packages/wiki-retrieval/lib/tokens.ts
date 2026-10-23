// The one tokeniser for Pages and Queries (research #45, section 2).

const STOP = new Set(
  "a an and are as at be by do does did for from how in is it its of on or our the to was we what when which who whom why with you your src".split(
    " "
  )
);

const MONTHS =
  "january february march april may june july august september october november december".split(
    " "
  );
const MONTH_YEAR = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{4})\\b`, "gi");

/**
 * A decimal number (which may run on into letters, so `1099NEC` and `12A`
 * stay whole) or a run of letters and digits, either continued by `-` plus
 * more letters or digits.
 */
const TOKEN =
  /\d+(?:\.\d+)?[\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*|[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu;
const THOUSANDS = /(?<=\d),(?=\d{3}\b)/g;
const DAY = /^(\d{4}-\d{2})-\d{2}/;

/** Query side only: `September 2026` becomes `2026-09`. */
function normaliseQuery(query: string): string {
  return query.replace(
    MONTH_YEAR,
    (_, month: string, year: string) =>
      `${year}-${String(MONTHS.indexOf(month.toLowerCase()) + 1).padStart(2, "0")}`
  );
}

const kept = (token: string) => token.length >= 2 && !STOP.has(token);

/**
 * Lowercased tokens: identifiers, amounts, dates and slugs stay whole, every
 * hyphenated compound also emits its parts, and a `YYYY-MM-DD` compound also
 * emits `YYYY-MM`. Pass `query` for Query text.
 */
export function tokenise(
  text: string,
  { query = false }: { query?: boolean } = {}
): string[] {
  const norm = (query ? normaliseQuery(text) : text)
    .toLowerCase()
    .replace(THOUSANDS, "");
  const out: string[] = [];
  for (const [token] of norm.matchAll(TOKEN)) {
    if (!kept(token)) continue;
    out.push(token);
    if (!token.includes("-")) continue;
    out.push(...token.split("-").filter(kept));
    const month = DAY.exec(token);
    if (month) out.push(month[1]);
  }
  return out;
}
