import type { Address, Bible, DocSpec } from "../bible";
import { totalsOf } from "./amounts";
import { addDays, endOfMonth } from "./format";
import { closingOf, extensionOf, render, type RenderContext } from "./render";
import type {
  ExpectedObligation,
  Manifest,
  ManifestEntry,
  ProfileFact,
  SourceKind,
} from "./types";

export interface GeneratedCorpus {
  sources: { file: string; body: string }[];
  manifest: Manifest;
  /** The Corpus review note: one brief line per Source. */
  review: string;
}

type Of<T extends DocSpec["template"]> = Extract<DocSpec, { template: T }>;

const KIND: Record<DocSpec["template"], SourceKind> = {
  articles: "formation",
  "ein-letter": "formation",
  "operating-agreement": "formation",
  w9: "tax-form",
  "business-license": "license",
  "sales-tax-registration": "license",
  permit: "permit",
  "insurance-certificate": "insurance-certificate",
  lease: "lease",
  "service-agreement": "service-agreement",
  invoice: "invoice",
  receipt: "receipt",
  "bank-statement": "bank-statement",
  "dental-bill": "bill",
};

const fullAddress = (a: Address): string =>
  [a.street, a.suite, a.city].filter((x): x is string => Boolean(x)).join(", ");

/** Ids `YYYY-MM-DD-<slug>` in document order; a repeated id gets `-2`, `-3`. */
function assignIds(docs: DocSpec[]): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const d of docs) {
    const base = `${d.date}-${d.slug}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    ids.set(d.key, id);
  }
  return ids;
}

/** The next annual report due date: last day of the formation month, on or after the Demo Date. */
function annualReportDue(formed: string, demoDate: string): string {
  const month = Number(formed.slice(5, 7));
  const year = Number(demoDate.slice(0, 4));
  const thisYear = endOfMonth(year, month);
  return thisYear >= demoDate ? thisYear : endOfMonth(year + 1, month);
}

interface Contribution {
  vendor?: string | null;
  expense?: {
    amount: number;
    allocations: ManifestEntry["allocations"];
    status: "paid" | "unknown";
    due: string | null;
  };
  obligations?: ExpectedObligation[];
  profile?: ProfileFact[];
  milestone?: string;
  masked?: ManifestEntry["masked"];
  corroborates?: string[];
  duplicateOf?: string;
}

function contribution(
  d: DocSpec,
  bible: Bible,
  idOf: (key: string) => string
): Contribution {
  const b = bible.business;
  switch (d.template) {
    case "articles":
      return {
        obligations: [
          {
            kind: "annual-report",
            due: annualReportDue(b.formed, bible.demoDate),
            counterparty: null,
          },
        ],
        profile: [
          { fact: "legal-name", value: b.legalName },
          { fact: "entity-type", value: b.entityType },
          { fact: "formation-date", value: b.formed },
          { fact: "principal-address", value: fullAddress(b.address) },
          { fact: "registered-agent", value: b.registeredAgent.name },
          { fact: "owner", value: bible.owner.name },
        ],
        milestone: b.formed,
      };
    case "ein-letter":
      return {
        profile: [
          { fact: "ein", value: b.ein },
          { fact: "legal-name", value: b.legalName },
          { fact: "entity-type", value: "single member" },
          { fact: "business-started", value: b.started },
          { fact: "owner", value: bible.owner.name },
        ],
        milestone: d.date,
      };
    case "operating-agreement":
      return {
        profile: [
          { fact: "owner", value: bible.owner.name },
          { fact: "ownership", value: "100%" },
          { fact: "management", value: "member-managed" },
          { fact: "fiscal-year", value: b.fiscalYear },
        ],
      };
    case "w9":
      return {
        profile: [
          { fact: "owner-ssn", value: `***-**-${bible.owner.ssn.slice(-4)}` },
        ],
        masked: ["ssn"],
      };
    case "business-license":
      return {
        obligations: [
          { kind: "license-renewal", due: d.expires, counterparty: null },
        ],
        profile: [{ fact: "business-license", value: d.number }],
      };
    case "sales-tax-registration":
      return {
        obligations: [
          { kind: "license-renewal", due: d.expires, counterparty: null },
          { kind: "tax-filing", due: d.returnDue, counterparty: null },
        ],
        profile: [{ fact: "sales-tax-registration", value: d.number }],
      };
    case "permit":
      return {
        vendor: "office-of-the-city-clerk",
        expense: {
          amount: d.fee,
          allocations: [{ category: "other", amount: d.fee }],
          status: "paid",
          due: null,
        },
        obligations: [
          { kind: "permit-expiry", due: d.expires, counterparty: null },
        ],
        profile: [
          { fact: "operating-permit", value: d.number },
          { fact: "activity", value: b.activity },
        ],
      };
    case "insurance-certificate":
      return {
        obligations: d.newObligation
          ? [{ kind: "insurance-renewal", due: d.expires, counterparty: null }]
          : [],
        profile:
          d.suite === b.address.suite
            ? [{ fact: "insurer", value: bible.insurer.name }]
            : [{ fact: "premises-suite", value: d.suite }],
      };
    case "lease":
      return {
        obligations: [
          {
            kind: "lease-notice",
            due: addDays(bible.lease.end, -bible.lease.noticeDays),
            counterparty: bible.landlord.slug,
          },
        ],
        profile: [
          { fact: "premises", value: b.address.street },
          { fact: "premises-suite", value: b.address.suite ?? "" },
          { fact: "landlord", value: bible.landlord.name },
        ],
        milestone: bible.lease.start,
      };
    case "service-agreement":
      return {
        obligations: [
          {
            kind: "contract-renewal",
            due: bible.client.end,
            counterparty: bible.client.slug,
          },
        ],
      };
    case "invoice": {
      const t = totalsOf(d.items, d.taxRate, d.shipping);
      const paid = Boolean(d.paidNote || d.stamp);
      return {
        vendor: d.vendor.slug,
        expense: {
          amount: t.total,
          allocations: t.allocations,
          status: paid ? "paid" : "unknown",
          due: d.due,
        },
        obligations:
          d.due && !paid
            ? [{ kind: "other", due: d.due, counterparty: d.vendor.slug }]
            : [],
        masked: d.bankDetails && d.vendor.ach ? ["account"] : [],
        ...(d.duplicateOf ? { duplicateOf: d.duplicateOf } : {}),
      };
    }
    case "receipt": {
      const t = totalsOf(d.items, d.taxRate);
      return {
        vendor: d.vendor.slug,
        expense: {
          amount: t.total,
          allocations: t.allocations,
          status: "paid",
          due: null,
        },
        ...(d.duplicateOf ? { duplicateOf: d.duplicateOf } : {}),
      };
    }
    case "dental-bill": {
      const t = totalsOf(d.items, 0);
      return {
        vendor: d.vendor.slug,
        expense: {
          amount: t.total,
          allocations: t.allocations,
          status: "paid",
          due: null,
        },
      };
    }
    case "bank-statement":
      return {
        profile: [
          { fact: "bank", value: bible.bank.name },
          {
            fact: "bank-account",
            value: `****${bible.bank.account.slice(-4)}`,
          },
        ],
        masked: d.fullAccount ? ["account"] : [],
        corroborates: d.corroborates.map(idOf),
      };
  }
}

const FLAG_OF: Partial<Record<string, string>> = {
  contradiction: "conflict",
  "prompt-injection": "suspicious-content",
  "ambiguous-category": "needs-owner",
};

function entryOf(
  d: DocSpec,
  bible: Bible,
  idOf: (key: string) => string
): ManifestEntry {
  const id = idOf(d.key);
  const c = contribution(d, bible, idOf);
  const log = [`INGEST [${id}]`];
  const flag = d.trap ? FLAG_OF[d.trap] : undefined;
  if (flag) log.push(`FLAG [${flag}]`);
  if (c.milestone) log.push(`MILESTONE [${c.milestone}]`);
  return {
    id,
    file: `${id}.${extensionOf(d)}`,
    kind: KIND[d.template],
    date: d.date,
    vendor: c.vendor ?? null,
    amount: c.expense?.amount ?? null,
    allocations: c.expense?.allocations ?? [],
    payment: c.expense
      ? { status: c.expense.status, due: c.expense.due }
      : null,
    obligations: c.obligations ?? [],
    profile: c.profile ?? [],
    trap: d.trap ?? null,
    inbox: d.inbox ?? false,
    duplicateOf: c.duplicateOf ? idOf(c.duplicateOf) : null,
    corroborates: c.corroborates ?? [],
    masked: c.masked ?? [],
    log,
    brief: d.brief,
  };
}

function reviewOf(bible: Bible, entries: ManifestEntry[]): string {
  const lines = entries.map((e) => {
    const tags = [
      e.kind,
      e.trap ? `Trap: ${e.trap}` : null,
      e.inbox ? "Inbox" : null,
    ]
      .filter(Boolean)
      .join("; ");
    return `- \`${e.id}\` (${tags}): ${e.brief}`;
  });
  return `# Corpus review: ${bible.business.legalName}

Generated by \`bun run corpus:generate\` from \`packages/corpus/bible.ts\`; do not edit by hand.
Demo Date ${bible.demoDate}. ${entries.length} Sources under \`corpus/sources/\`, ground truth in
\`corpus/manifest.json\`. One line per Source for the Owner's single review pass: read the
brief, open the Source, and check it says what the brief claims. Inbox Sources are held back
from the \`full\` fixture.

${lines.join("\n")}
`;
}

/** Render every Source, the Manifest, and the review note from a Bible. */
export function generateCorpus(bible: Bible): GeneratedCorpus {
  const docs = bible.documents;
  const byKey = new Map(docs.map((d) => [d.key, d]));
  const ids = assignIds(docs);
  const idOf = (key: string): string => {
    const id = ids.get(key);
    if (!id) throw new Error(`no document with key ${key}`);
    return id;
  };
  const statements = docs.filter(
    (d): d is Of<"bank-statement"> => d.template === "bank-statement"
  );
  const ctx: RenderContext = {
    bible,
    doc(key) {
      const d = byKey.get(key);
      if (!d) throw new Error(`no document with key ${key}`);
      return d;
    },
    opening(key) {
      let balance = 0;
      for (const s of statements) {
        balance = s.opening ?? balance;
        if (s.key === key) return balance;
        balance = closingOf(s, ctx, balance);
      }
      throw new Error(`no statement with key ${key}`);
    },
  };
  const entries = docs.map((d) => entryOf(d, bible, idOf));
  const sources = docs.map((d, i) => ({
    file: (entries[i] as ManifestEntry).file,
    body: render(d, ctx),
  }));
  const manifest: Manifest = {
    business: bible.business.legalName,
    demoDate: bible.demoDate,
    sources: [...entries].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return { sources, manifest, review: reviewOf(bible, manifest.sources) };
}
