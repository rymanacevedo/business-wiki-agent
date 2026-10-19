import { loadYaml } from "eve/evals/loaders";
import { z } from "zod";

const pattern = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
const CLASSES = ["normal", "edge", "trap"] as const;
const OPTIONAL_TAGS = ["trust", "trajectory", "multi-turn", "calibration"];

/** The judges a row runs: `referral` is the choice judge expecting `declined-with-referral`. */
export const JUDGES = ["faithful", "cited", "tone", "referral"] as const;
export type Judge = (typeof JUDGES)[number];

const row = z
  .object({
    caseId: z.string().regex(/^query-[a-z0-9-]+$/),
    description: z.string().min(1),
    tags: z
      .array(z.string())
      .refine(
        (tags) =>
          tags.filter((t) => (CLASSES as readonly string[]).includes(t))
            .length === 1,
        "exactly one class tag (normal | edge | trap)"
      )
      .refine(
        (tags) =>
          tags.every(
            (t) =>
              (CLASSES as readonly string[]).includes(t) ||
              OPTIONAL_TAGS.includes(t)
          ),
        `optional tags are ${OPTIONAL_TAGS.join(", ")}`
      ),
    /** One message, or one per turn (checks apply to the last turn). */
    prompt: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    must_include: z.array(pattern).default([]),
    must_not_include: z.array(pattern).default([]),
    /** Page paths or Source ids the answer must cite (substring match). */
    cites: z.array(pattern).default([]),
    /** More Pages the judges read (substring match on path), with no gate. */
    pages: z.array(pattern).default([]),
    judges: z.array(z.enum(JUDGES)).default([]),
    /** `none`: the row asserts `usedNoTools()` instead of the standard trajectory. */
    tools: z.enum(["standard", "none"]).default("standard"),
  })
  .strict()
  .transform(({ prompt, ...rest }) => ({
    ...rest,
    prompts: typeof prompt === "string" ? [prompt] : prompt,
  }));

export type QueryCase = z.output<typeof row>;

const dataset = z.object({ rows: z.array(row).min(1) }).strict();

/**
 * The Query slice's rows from the YAML dataset (path from the app root, or
 * absolute), validated, in file order. Row order is frozen so eval ids
 * (`query/questions/<index>`) stay stable.
 */
export async function loadQueryCases(path: string): Promise<QueryCase[]> {
  const parsed = dataset.safeParse(await loadYaml(path));
  if (!parsed.success)
    throw new Error(`${path}: ${z.prettifyError(parsed.error)}`);
  const ids = parsed.data.rows.map((r) => r.caseId);
  const repeated = ids.find((id, i) => ids.indexOf(id) !== i);
  if (repeated) throw new Error(`${path}: caseId ${repeated} appears twice`);
  return parsed.data.rows;
}
