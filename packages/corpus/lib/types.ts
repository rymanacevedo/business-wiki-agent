/** Kinds of Source document in the Corpus. */
export const SOURCE_KINDS = [
  "formation",
  "license",
  "permit",
  "insurance-certificate",
  "lease",
  "bank-statement",
  "invoice",
  "receipt",
  "service-agreement",
  "tax-form",
  "bill",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Expense categories: the Schema's closed list, plus `personal` for non-business Sources. */
export const EXPENSE_CATEGORIES = [
  "supplies",
  "equipment",
  "rent",
  "utilities",
  "insurance",
  "professional-services",
  "vehicle",
  "meals",
  "software",
  "other",
  "personal",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Obligation kinds: the Schema's closed list. */
export const OBLIGATION_KINDS = [
  "license-renewal",
  "permit-expiry",
  "insurance-renewal",
  "tax-filing",
  "annual-report",
  "lease-notice",
  "contract-renewal",
  "other",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/**
 * The eight Traps the spec plants, then the two planted cases that ride along:
 * the PAID-stamped duplicate of an invoice, and a distinct invoice sharing a
 * sibling's vendor, amount, and date. Each appears on exactly one Source.
 */
export const TRAPS = [
  "contradiction",
  "supersession",
  "ambiguous-category",
  "duplicate",
  "pii",
  "prompt-injection",
  "out-of-scope",
  "past-deadline",
  "paid-duplicate",
  "distinct-same-amount",
] as const;
export type Trap = (typeof TRAPS)[number];

export const PAYMENT_STATUSES = ["paid", "unpaid", "unknown"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Number classes `read_source` masks; a Source lists the ones it prints in full. */
export type MaskedClass = "ssn" | "account";

export interface Allocation {
  category: ExpenseCategory;
  amount: number;
}

export interface ExpectedObligation {
  kind: ObligationKind;
  due: string;
  counterparty: string | null;
}

export interface ProfileFact {
  fact: string;
  value: string;
}

/** What one Source must contribute to the Wiki. */
export interface ManifestEntry {
  /** `YYYY-MM-DD-<slug>`, the file stem. */
  id: string;
  /** File name under `corpus/sources/`. */
  file: string;
  kind: SourceKind;
  /** The document's own date. */
  date: string;
  /** Entity slug of the counterparty for an expense, else null. */
  vendor: string | null;
  /** The Source's total when it evidences an expense, else null. */
  amount: number | null;
  /** Expected Allocations; [] when the Source evidences no expense. */
  allocations: Allocation[];
  /** Payment block the Record should carry on first write, null when no expense. */
  payment: { status: PaymentStatus; due: string | null } | null;
  obligations: ExpectedObligation[];
  profile: ProfileFact[];
  trap: Trap | null;
  /** Held back from the `full` fixture: the demo's Inbox. */
  inbox: boolean;
  /** The Source this one duplicates; a duplicate adds no Record. */
  duplicateOf: string | null;
  /** Records a statement shows already paid (noted under `## Also seen in`). */
  corroborates: string[];
  /** Number classes printed in full that Masking must hide. */
  masked: MaskedClass[];
  /** Expected Log lines after the date, as `TYPE [subject]`. */
  log: string[];
  /** One-line brief for the Owner's review pass. */
  brief: string;
}

export interface Manifest {
  business: string;
  demoDate: string;
  sources: ManifestEntry[];
}
