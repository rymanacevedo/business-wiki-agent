import type { Address, Bible, DocSpec } from "../bible";
import { totalsOf } from "./amounts";
import { dashDate, longDate, money, monthName, round2, usDate } from "./format";

type Of<T extends DocSpec["template"]> = Extract<DocSpec, { template: T }>;

/** What a renderer may look up about the rest of the Corpus. */
export interface RenderContext {
  bible: Bible;
  doc(key: string): DocSpec;
  /** Opening balance of a statement: its own, or the previous statement's close. */
  opening(key: string): number;
}

export interface StatementLine {
  date: string;
  desc: string;
  withdrawal: number | null;
  deposit: number | null;
}

const full = (a: Address): string =>
  [a.street, a.suite, a.city].filter((x): x is string => Boolean(x)).join(", ");
const short = (a: Address): string =>
  `${a.short}${a.suite ? ` ${a.suite.replace("Suite", "Ste")}` : ""}`;

// --- OCR noise --------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOOKALIKE: Record<string, string> = {
  O: "0",
  I: "1",
  S: "5",
  B: "8",
  E: "F",
  A: "4",
  G: "6",
  L: "1",
  T: "7",
  D: "0",
  U: "V",
  M: "N",
  H: "N",
  C: "(",
};

/** Deterministic scanner noise: look-alike swaps and doubled spaces; digits untouched. */
function noisy(text: string, rand: () => number, rate = 0.08): string {
  let out = "";
  for (const c of text) {
    const r = rand();
    if (/[A-Z]/.test(c) && r < rate) out += LOOKALIKE[c] ?? c;
    else if (c === " " && r < 0.06) out += "  ";
    else out += c;
  }
  return out;
}

/** Label left, value right in a 32-column receipt line; never run them together. */
const row = (label: string, value: string, width = 32): string =>
  `${label} ${value.padStart(Math.max(0, width - label.length - 1))}`;

// --- Templates ----------------------------------------------------------------

function articles(d: Of<"articles">, { bible }: RenderContext): string {
  const b = bible.business;
  return `# Articles of Organization

**${bible.agencies.formation}**
Limited Liability Company

- Filing number: ${d.filingNumber}
- Filed: ${longDate(d.date)}
- Effective: ${longDate(b.formed)}

1. **Name.** The name of the limited liability company is ${b.legalName}.
2. **Principal office.** ${full(b.address)}.
3. **Registered agent.** ${bible.business.registeredAgent.name}, ${full(b.registeredAgent.address as Address)}.
4. **Management.** The company is managed by its members.
5. **Organizer and member.** ${bible.owner.name}, ${full(b.address)}.
6. **Purpose.** ${b.activity}, and any other lawful business.
7. **Duration.** Perpetual.

**Annual report.** Every limited liability company must file an annual report with the
Secretary of State by the last day of the month in which it was formed. For this company the
report is due by ${monthName(b.formed)} ${lastDayOfMonth(b.formed)} of each year, beginning the year after formation.

/s/ ${bible.owner.name}, Organizer

Filed and recorded ${longDate(d.date)}. ${bible.agencies.formation}.
`;
}

function lastDayOfMonth(iso: string): number {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function einLetter(d: Of<"ein-letter">, { bible }: RenderContext): string {
  const b = bible.business;
  const pad = " ".repeat(49);
  return `${bible.agencies.federalTax.toUpperCase().padEnd(49)}Date of this notice: ${dashDate(d.date)}
${pad}Employer Identification Number:
${pad}${b.ein}
${b.legalName.toUpperCase()}
${bible.owner.name.toUpperCase()} SOLE MBR
${short(b.address).toUpperCase()}
${b.address.city.toUpperCase()}

WE ASSIGNED YOU AN EMPLOYER IDENTIFICATION NUMBER

Thank you for applying for an Employer Identification Number (EIN). We assigned you
EIN ${b.ein}. This EIN will identify you, your business accounts, tax returns, and
documents, even if you have no employees.

Based on the information received from you or your representative, you must file
the following form(s) by the date(s) shown: Form 1040 Schedule C (annual).

Legal name: ${b.legalName.toUpperCase()}
Entity type: Limited Liability Company, single member (disregarded entity)
Date business started: ${dashDate(b.started)}
`;
}

function operatingAgreement(
  d: Of<"operating-agreement">,
  { bible }: RenderContext
): string {
  const b = bible.business;
  const o = bible.owner;
  return `# Operating Agreement of ${b.legalName}

A single-member limited liability company. Effective ${longDate(d.date)}.

1. **Formation.** The Company was formed by filing Articles of Organization with the
   Secretary of State on ${longDate(b.formed)}.
2. **Member.** ${o.name} is the sole Member and holds 100% of the membership interest.
3. **Management.** The Company is member-managed. The Member has full authority to bind
   the Company, open accounts, sign contracts, and hire professionals.
4. **Principal office.** ${full(b.address)}, or another place the Member chooses.
5. **Fiscal year.** The fiscal year of the Company is the ${b.fiscalYear}.
6. **Tax treatment.** While it has one Member, the Company is disregarded as separate from
   its Member for federal income tax purposes.
7. **Banking.** Company funds are kept in accounts in the Company's name, separate from the
   Member's personal funds.
8. **Records.** The Company keeps its formation documents, licenses, tax filings, and
   financial records at its principal office.
9. **Dissolution.** The Company dissolves on the written decision of the Member.

Signed ${longDate(d.date)}.

/s/ ${o.name}, ${o.title}
`;
}

function w9(d: Of<"w9">, { bible }: RenderContext): string {
  const b = bible.business;
  const r = d.requester;
  return `# Form W-9: Request for Taxpayer Identification Number and Certification

Requested by: ${r.name}, ${full(r.address as Address)} (vendor setup)

1. Name (as shown on your income tax return): ${bible.owner.name}
2. Business name/disregarded entity name, if different from above: ${b.legalName}
3. Federal tax classification: [X] Individual/sole proprietor or single-member LLC
4. Exemptions: none
5. Address (number, street, and apt. or suite no.): ${short(b.address)}
6. City: ${b.address.city}

## Part I: Taxpayer Identification Number (TIN)

Social security number: ${bible.owner.ssn}

Employer identification number: (left blank)

## Part II: Certification

Under penalties of perjury, I certify that the number shown on this form is my correct
taxpayer identification number and that I am not subject to backup withholding.

Signature: /s/ ${bible.owner.name}        Date: ${usDate(d.date)}
`;
}

function businessLicense(
  d: Of<"business-license">,
  { bible }: RenderContext
): string {
  const b = bible.business;
  return `# ${bible.agencies.licensing}

## Business License

- License No.: ${d.number}
- Licensee: ${b.legalName}
- Doing business at: ${full(b.address)}
- Owner: ${bible.owner.name}
- Classification: ${b.activity}
- Issued: ${longDate(d.date)}
- Expires: ${longDate(d.expires)}

This license is not transferable. Renew on or before the expiration date to continue
operating. Post this license in a conspicuous place at the business location.
`;
}

function salesTax(
  d: Of<"sales-tax-registration">,
  { bible }: RenderContext
): string {
  const b = bible.business;
  const year = Number(d.returnDue.slice(0, 4)) - 1;
  return `# ${bible.agencies.revenue}

## Certificate of Registration: Sales and Use Tax

- Registration No.: ${d.number}
- Registered business: ${b.legalName}
- Location: ${full(b.address)}
- Federal EIN: ${b.ein}
- Effective date: ${longDate(d.date)}
- Valid through: ${longDate(d.expires)}

**Filing frequency: annual.** The return for each calendar year is due January 31 of the
following year. Your next return (calendar year ${year}) is due ${longDate(d.returnDue)}.

Renew this registration before it expires. Display this certificate at the location above.
`;
}

function permit(d: Of<"permit">, { bible }: RenderContext): string {
  const b = bible.business;
  return `${bible.agencies.city.toUpperCase()}
GENERAL BUSINESS OPERATING PERMIT

Permit No.: ${d.number}
Issued to: ${b.legalName}
Business address: ${b.address.short}, ${b.address.suite}
Business activity: ${b.activity}
Owner / responsible party: ${bible.owner.name}

Issue date: ${longDate(d.date)}
Expiration date: ${longDate(d.expires)}
Fee paid: $${money(d.fee)} (receipt ${d.feeReceipt})

This permit must be displayed at the business address and renewed before the
expiration date. Renewal applications are accepted up to 60 days before expiration.
Operating without a valid permit may result in penalties.
`;
}

function insurance(d: Of<"insurance-certificate">, ctx: RenderContext): string {
  const { bible } = ctx;
  const b = bible.business;
  const p = bible.insurer.producer;
  const prior = bible.documents.find(
    (x): x is Of<"insurance-certificate"> =>
      x.template === "insurance-certificate" &&
      x.date < d.date &&
      x.policy !== d.policy
  );
  const renewal = prior
    ? `\nThis certificate evidences the renewal of policy ${prior.policy}, which expires ${usDate(prior.expires)}.\n`
    : "";
  const holder = d.holder;
  return `CERTIFICATE OF LIABILITY INSURANCE                    Date issued: ${usDate(d.date)}

Producer: ${p.name}, ${(p.address as Address).short}, ${(p.address as Address).city}
Insured: ${b.legalName}
         ${b.address.short}, ${d.suite}
         ${b.address.city}

Insurer A: ${bible.insurer.name}

Type of insurance: Commercial General Liability (occurrence)
Policy number: ${d.policy}
Policy effective: ${usDate(d.effective)}      Policy expiration: ${usDate(d.expires)}
Each occurrence: $1,000,000      General aggregate: $2,000,000
Annual premium: $${money(d.premium)}
${renewal}
Certificate holder / additional insured: ${holder.name}, ${(holder.address as Address).street}, ${(holder.address as Address).city}

Should any of the above described policies be cancelled before the expiration date
thereof, notice will be delivered in accordance with the policy provisions.
`;
}

function lease(d: Of<"lease">, { bible }: RenderContext): string {
  const b = bible.business;
  const l = bible.lease;
  const ll = bible.landlord;
  return `# Commercial Lease Agreement

This lease is made as of ${longDate(d.date)}.

- **Landlord:** ${ll.name}, ${(ll.address as Address).street}, ${(ll.address as Address).city}
- **Tenant:** ${b.legalName}, a single-member limited liability company (${bible.owner.name}, ${bible.owner.title})

1. **Premises.** Landlord leases to Tenant the premises known as ${full(b.address)}
   (approx. ${l.sqft} sq ft, ground floor workshop and office).
2. **Term.** Twenty-four (24) months commencing ${longDate(l.start)} and ending ${longDate(l.end)}.
3. **Rent.** $${money(l.rent)} per month, due on the 1st. Late after the 5th ($75 fee).
4. **Security deposit.** $${money(l.deposit)}, held by Landlord.
5. **Renewal and notice.** This lease renews for one further 12-month term on the same
   terms unless either party gives written notice of non-renewal at least ninety (${l.noticeDays})
   days before the end of the term.
6. **Use.** Appliance repair workshop, parts storage, customer drop-off. No vehicle repair.
7. **Insurance.** Tenant shall maintain commercial general liability insurance of not
   less than $1,000,000 per occurrence naming Landlord as additional insured.

Signed ${longDate(l.signed)}.

/s/ ${ll.manager}, Manager, ${ll.name}
/s/ ${bible.owner.name}, ${bible.owner.title}, ${b.legalName}
`;
}

function serviceAgreement(
  d: Of<"service-agreement">,
  { bible }: RenderContext
): string {
  const b = bible.business;
  const c = bible.client;
  return `# Appliance Service Agreement

Dated ${longDate(d.date)}, between **${c.name}**, ${full(c.address as Address)} ("Client"),
and **${b.legalName}**, ${full(b.address)} ("Contractor").

1. **Services.** Contractor diagnoses and repairs appliances in the residential units the
   Client manages, on request by the Client's property manager.
2. **Rates.** $${money(c.rate)} per hour of labor; parts at cost plus 10%. Contractor invoices
   monthly; invoices are payable net 30.
3. **Term.** This agreement begins ${longDate(c.start)} and ends ${longDate(c.end)}. It renews
   automatically for successive one-year terms unless either party gives written notice of
   non-renewal before the end of the then-current term.
4. **Insurance.** Contractor keeps commercial general liability insurance of at least
   $1,000,000 per occurrence and gives Client a certificate of insurance naming Client as
   certificate holder.
5. **Tax forms.** Contractor provides a completed Form W-9 before the first payment.
6. **Termination.** Either party may end this agreement on 30 days' written notice.

/s/ ${c.contact}, Property Manager, ${c.name}
/s/ ${bible.owner.name}, ${bible.owner.title}, ${b.legalName}
`;
}

function cascadeInvoice(d: Of<"invoice">, { bible }: RenderContext): string {
  const v = d.vendor;
  const b = bible.business;
  const t = totalsOf(d.items, d.taxRate, d.shipping);
  const a = v.address as Address;
  const terms = d.due
    ? `Terms: ${d.terms}   Due: ${usDate(d.due)}`
    : `Terms: ${d.terms}`;
  const lines = t.lines.map(
    (l) =>
      `${String(l.item.qty).padEnd(5)}${l.item.desc.padEnd(39)}${money(l.item.unit).padStart(5)}${money(l.total).padStart(10)}`
  );
  const total = (label: string, n: number) =>
    `${" ".repeat(40)}${label.padEnd(8)}${money(n).padStart(10)}`;
  const totals = [
    total("Subtotal", t.subtotal),
    total(`Tax ${(d.taxRate * 100).toFixed(1)}%`, t.tax),
    ...(t.shipping ? [total("Shipping", t.shipping)] : []),
    total("TOTAL", t.total),
  ];
  const ach = v.ach
    ? `Pay by check or ACH. ACH: Routing ${v.ach.routing}  Account ${v.ach.account}`
    : "";
  return `${v.name.toUpperCase()}
Wholesale parts for service professionals
${a.short}, ${a.city}   ${v.email}   ${v.phone}

${`INVOICE  #${d.number}`.padEnd(44)}Date: ${usDate(d.date)}
${`Bill to: ${b.legalName}`.padEnd(44)}${terms}
${`         ${short(b.address)}`.padEnd(44)}Customer #: ${d.customerNo}

Qty  ${"Item".padEnd(39)}${"Unit".padEnd(5)}${"Total".padStart(10)}
${lines.join("\n")}
${totals.join("\n")}
${d.paidNote ? `\n${d.paidNote}\n` : ""}
${ach}
Thank you for your business.
${d.stamp ? `\n   [stamp]  ${d.stamp}\n` : ""}`;
}

function plainInvoice(d: Of<"invoice">, { bible }: RenderContext): string {
  const v = d.vendor;
  const b = bible.business;
  const t = totalsOf(d.items, d.taxRate, d.shipping);
  const contact = [
    v.address ? `${v.address.short}, ${v.address.city}` : null,
    v.phone,
    v.email,
  ]
    .filter(Boolean)
    .join("  |  ");
  const lines = t.lines.map(
    (l) =>
      `${l.item.desc.padEnd(48)}${String(l.item.qty).padStart(4)}${money(l.total).padStart(11)}`
  );
  const sum = (label: string, n: number) =>
    `${label.padEnd(52)}${money(n).padStart(11)}`;
  return `${v.name}
${contact}

INVOICE ${d.number}
Invoice date: ${longDate(d.date)}
Bill to: ${b.legalName}, ${short(b.address)}, ${b.address.city}
Terms: ${d.terms}${d.due ? `     Due date: ${longDate(d.due)}` : ""}

${"Description".padEnd(48)}${"Qty".padStart(4)}${"Amount".padStart(11)}
${lines.join("\n")}

${sum("Subtotal", t.subtotal)}
${d.taxRate ? `${sum(`Tax (${(d.taxRate * 100).toFixed(1)}% on parts)`, t.tax)}\n` : ""}${sum("Total", t.total)}
${d.paidNote ? `\n${d.paidNote}\n` : `\nAmount due: $${money(t.total)}\n`}${d.notes ? `\nNotes:\n${d.notes}\n` : ""}
Questions about this invoice? Contact ${v.email ?? v.phone}.
`;
}

const FOOTERS: Record<string, string[]> = {
  "harbor-hardware-supply": [
    "RETURNS W/ RECEIPT 30 DAYS",
    "THANK YOU FOR SHOPPING LOCAL",
  ],
  "paper-trail-office-supply": ["RETURNS W/ RECEIPT 30 DAYS", "THANK YOU"],
  "valley-electric-supply": ["NO RETURNS ON ELECTRICAL", "THANK YOU"],
  "portside-fuel-stop": ["THANK YOU DRIVE SAFE"],
  "dockside-deli": ["THANKS!! COME AGAIN"],
  "portside-power-light": ["KEEP THIS RECEIPT FOR YOUR RECORDS"],
  "freshway-market": [
    "YOU SAVED 1.20 TODAY",
    "THANK YOU FOR SHOPPING FRESHWAY",
  ],
};

function receipt(d: Of<"receipt">, { bible }: RenderContext): string {
  const rand = mulberry32(d.scan);
  const v = d.vendor;
  const t = totalsOf(d.items, d.taxRate);
  const trn = `${d.date.slice(8)}${d.time.replace(":", "")}`;
  const out: string[] = [v.name.toUpperCase()];
  if (d.showAddress && v.address) {
    out.push(noisy(`${v.address.short} ${v.address.city}`.toUpperCase(), rand));
  }
  out.push(`${usDate(d.date)} ${d.time}  ${noisy("REG", rand)} 2  TRN ${trn}`);
  out.push("-".repeat(32));
  for (const l of t.lines) {
    out.push(row(noisy(l.item.desc.toUpperCase(), rand), money(l.total)));
    if (l.item.qty > 1) out.push(`  ${l.item.qty} @ ${money(l.item.unit)}`);
  }
  out.push(row("SUBTOTAL", money(t.subtotal)));
  if (d.taxRate)
    out.push(row(`TAX ${(d.taxRate * 100).toFixed(1)}%`, money(t.tax)));
  out.push(row("TOTAL", money(t.total)));
  if (d.tender === "cash") {
    const tendered = Math.ceil(t.total / 10) * 10;
    out.push(
      row("CASH", money(tendered)),
      row("CHANGE", money(round2(tendered - t.total)))
    );
  } else {
    const card =
      d.tender === "debit"
        ? `DEBIT ************${bible.bank.card}`
        : `VISA ************${bible.personalCard}`;
    out.push(row(card, money(t.total)));
    out.push(
      noisy(
        `AUTH ${(d.scan * 7919).toString(36).toUpperCase().slice(0, 6)}  APPROVED`,
        rand
      )
    );
  }
  if (v.slug === "freshway-market")
    out.push(
      noisy(`FRESHWAY REWARDS: ${bible.owner.name.toUpperCase()}`, rand)
    );
  for (const f of FOOTERS[v.slug] ?? ["THANK YOU"]) out.push(noisy(f, rand));
  return `${out.join("\n")}\n`;
}

function dentalBill(d: Of<"dental-bill">, { bible }: RenderContext): string {
  const v = d.vendor;
  const t = totalsOf(d.items, 0);
  const lines = t.lines.map(
    (l) =>
      `${usDate(d.date).padEnd(17)}${l.item.desc.padEnd(40)}${money(l.total).padStart(9)}`
  );
  const sum = (label: string, value: string) =>
    `${label.padEnd(57)}${value.padStart(9)}`;
  return `${v.name.toUpperCase()}
${full(v.address as Address)}   ${v.phone}

PATIENT STATEMENT                                  Statement date: ${usDate(d.date)}
Patient: ${bible.owner.name}
Responsible party: ${bible.owner.name}

${"Date of service".padEnd(17)}${"Description".padEnd(40)}${"Fee".padStart(9)}
${lines.join("\n")}

${sum("Total charges", money(t.total))}
${sum("Insurance payments", money(0))}
${sum("Patient payments", `-${money(t.total)}`)}

${d.paidNote}
Thank you for choosing ${v.name}.
`;
}

/** The lines of a statement: corroborated card payments and deposits, by date. */
export function statementLines(
  d: Of<"bank-statement">,
  ctx: RenderContext
): StatementLine[] {
  const card = ctx.bible.bank.card;
  const lines: StatementLine[] = d.corroborates.map((key) => {
    const r = ctx.doc(key);
    if (r.template !== "receipt" && r.template !== "invoice") {
      throw new Error(
        `statement ${d.key} corroborates ${key}, which is not a receipt or invoice`
      );
    }
    const t = totalsOf(
      r.items,
      r.taxRate,
      r.template === "invoice" ? r.shipping : 0
    );
    const name = r.vendor.statementName ?? r.vendor.name.toUpperCase();
    const how =
      r.template === "invoice" && r.terms === "Autopay"
        ? "RECURRING CARD PMT"
        : "DEBIT CARD PURCHASE";
    return {
      date: r.date,
      desc: `${how} ${card} ${name}`,
      withdrawal: t.total,
      deposit: null,
    };
  });
  for (const dep of d.deposits) {
    lines.push({
      date: dep.date,
      desc: dep.desc,
      withdrawal: null,
      deposit: dep.amount,
    });
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

function bankStatement(d: Of<"bank-statement">, ctx: RenderContext): string {
  const { bible } = ctx;
  const bank = bible.bank;
  const b = bible.business;
  const lines = statementLines(d, ctx);
  let balance = ctx.opening(d.key);
  const opening = balance;
  const body = lines.map((l) => {
    balance = round2(balance - (l.withdrawal ?? 0) + (l.deposit ?? 0));
    return `${usDate(l.date).slice(0, 5)}  ${l.desc.padEnd(50)}${(l.withdrawal ? money(l.withdrawal) : "").padStart(12)}${(l.deposit ? money(l.deposit) : "").padStart(12)}${money(balance).padStart(12)}`;
  });
  const withdrawals = lines.filter((l) => l.withdrawal);
  const deposits = lines.filter((l) => l.deposit);
  const sumOf = (xs: StatementLine[], f: (l: StatementLine) => number) =>
    round2(xs.reduce((a, l) => a + f(l), 0));
  const account = d.fullAccount
    ? `Account number: ${bank.account}        Routing number: ${bank.routing}`
    : `Account: ****${bank.account.slice(-4)}`;
  const summary = (label: string, n: number) =>
    `${label.padEnd(36)}${money(n).padStart(12)}`;
  return `${bank.name.toUpperCase()}
${(bank.address as Address).short}, ${(bank.address as Address).city}

BUSINESS CHECKING STATEMENT
${b.legalName.toUpperCase()}
${short(b.address).toUpperCase()}
${b.address.city.toUpperCase()}

${account}
Statement period: ${usDate(d.periodStart)} - ${usDate(d.date)}

${summary("Beginning balance", opening)}
${summary(
  `Total deposits (${deposits.length})`,
  sumOf(deposits, (l) => l.deposit ?? 0)
)}
${summary(
  `Total withdrawals (${withdrawals.length})`,
  sumOf(withdrawals, (l) => l.withdrawal ?? 0)
)}
${summary("Ending balance", balance)}

${"DATE".padEnd(7)}${"DESCRIPTION".padEnd(50)}${"WITHDRAWALS".padStart(12)}${"DEPOSITS".padStart(12)}${"BALANCE".padStart(12)}
${body.join("\n")}

Card ${bank.card} is the business debit card on this account.
Thank you for banking with ${bank.name}.
`;
}

/** Ending balance of a statement given its opening balance. */
export function closingOf(
  d: Of<"bank-statement">,
  ctx: RenderContext,
  opening: number
): number {
  return statementLines(d, ctx).reduce(
    (bal, l) => round2(bal - (l.withdrawal ?? 0) + (l.deposit ?? 0)),
    opening
  );
}

/** The Source text for one document spec. */
export function render(d: DocSpec, ctx: RenderContext): string {
  switch (d.template) {
    case "articles":
      return articles(d, ctx);
    case "ein-letter":
      return einLetter(d, ctx);
    case "operating-agreement":
      return operatingAgreement(d, ctx);
    case "w9":
      return w9(d, ctx);
    case "business-license":
      return businessLicense(d, ctx);
    case "sales-tax-registration":
      return salesTax(d, ctx);
    case "permit":
      return permit(d, ctx);
    case "insurance-certificate":
      return insurance(d, ctx);
    case "lease":
      return lease(d, ctx);
    case "service-agreement":
      return serviceAgreement(d, ctx);
    case "invoice":
      return d.style === "cascade"
        ? cascadeInvoice(d, ctx)
        : plainInvoice(d, ctx);
    case "receipt":
      return receipt(d, ctx);
    case "bank-statement":
      return bankStatement(d, ctx);
    case "dental-bill":
      return dentalBill(d, ctx);
  }
}

/** File extension per template: agreements and letters are Markdown, the rest plain text. */
export function extensionOf(d: DocSpec): "md" | "txt" {
  return ["invoice", "receipt", "bank-statement", "dental-bill"].includes(
    d.template
  )
    ? "txt"
    : "md";
}
