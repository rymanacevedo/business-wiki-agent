type Value =
  null | boolean | number | string | Value[] | { [key: string]: Value };

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_./-]*$/;
// Literal blocks keep text readable; text with a control character other
// than newline or tab (a block cannot hold it) goes quoted instead.
const blockSafe = (text: string) =>
  [...text].every((c) => {
    const code = c.codePointAt(0)!;
    return (
      c === "\n" ||
      c === "\t" ||
      (code >= 0x20 && code !== 0x7f && code !== 0xfeff)
    );
  });

const key = (k: string) => (PLAIN_KEY.test(k) ? k : JSON.stringify(k));

function scalar(value: null | boolean | number | string, indent: number) {
  if (typeof value !== "string") return ` ${JSON.stringify(value)}`;
  if (!value.includes("\n") || !blockSafe(value))
    return ` ${JSON.stringify(value)}`;
  const trailing = value.length - value.replace(/\n+$/, "").length;
  const chomp = trailing === 0 ? "-" : trailing === 1 ? "" : "+";
  const body = trailing === 0 ? value : value.slice(0, -1);
  const pad = " ".repeat(indent + 2);
  const lines = body.split("\n").map((l) => (l === "" ? "" : pad + l));
  return ` |2${chomp}\n${lines.join("\n")}`;
}

function lines(value: Value, indent: number): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return " []";
    return value
      .map((item) => {
        const nested = lines(item, indent + 2);
        return `\n${pad}-${
          item !== null && typeof item === "object" && !Array.isArray(item)
            ? ` ${nested.trimStart()}`
            : nested
        }`;
      })
      .join("");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return " {}";
    return entries
      .map(([k, v]) => `\n${pad}${key(k)}:${lines(v, indent + 2)}`)
      .join("");
  }
  return scalar(value, indent - 2);
}

/** YAML for plain JSON-like data, with multi-line strings as literal blocks. */
export function toYaml(value: Value): string {
  return `${lines(value, 0).replace(/^\n/, "")}\n`;
}
