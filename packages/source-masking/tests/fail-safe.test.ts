import assert from "node:assert/strict";
import { test } from "node:test";
import { maskSource, maskedValues } from "../index";

test("masks a labelled number with Markdown emphasis on the label, the number, or both", () => {
  // The review's reproductions, then every marker on a 7-digit account
  // number, which only its label identifies.
  assert.equal(
    maskSource("**Account number:** 123456789012"),
    "**Account number:** ****9012"
  );
  assert.equal(
    maskSource("Routing number: **021000021**"),
    "Routing number: ******0021**"
  );
  for (const [open, close] of [
    ["**", "**"],
    ["__", "__"],
    ["*", "*"],
    ["_", "_"],
    ["`", "`"],
    ["~~", "~~"],
    ["***", "***"],
    ["<b>", "</b>"],
  ]) {
    const label = `${open}Account number:${close}`;
    const number = `${open}1234567${close}`;
    assert.equal(maskSource(`${label} 1234567`), `${label} ****4567`);
    assert.equal(
      maskSource(`Account number: ${number}`),
      `Account number: ${open}****4567${close}`
    );
    assert.equal(
      maskSource(`${label} ${number}`),
      `${label} ${open}****4567${close}`
    );
    assert.equal(
      maskSource(`${open}Account number: 1234567${close}`),
      `${open}Account number: ****4567${close}`
    );
  }
});

test("masks a labelled number in a link, a table, or behind HTML entities", () => {
  assert.equal(
    maskSource(
      [
        "[Account number](https://bank.example/acct): 1234567",
        "| **Account** | `1234567` |",
        "| Routing | Account |",
        "|---|---|",
        "| 021000021 | 1234567 |",
        "Account&nbsp;number:&nbsp;1234567",
        "Account&#160;No.&#58; 1234567",
        "<td>Account</td><td>1234567</td>",
      ].join("\n")
    ),
    [
      "[Account number](https://bank.example/acct): ****4567",
      "| **Account** | `****4567` |",
      "| Routing | Account |",
      "|---|---|",
      "| ****0021 | 1234567 |",
      "Account&nbsp;number:&nbsp;****4567",
      "Account&#160;No.&#58; ****4567",
      "<td>Account</td><td>****4567</td>",
    ].join("\n")
  );
});

test("masks an unlabelled long number however its groups are joined", () => {
  assert.equal(
    maskSource(
      [
        "ref 1234 5678 9012",
        "ref 1234 5678 9012",
        "ref 1234​5678​9012",
        "ref 1234–5678—9012",
        "ref 1234&nbsp;5678&#8201;9012",
        "ref 1234&ndash;5678&#45;9012",
        "ref **1234 5678 9012**",
        "ref 1234 **5678** 9012",
        "ref `1234-5678-9012`",
        "ref ~~1234~~ 5678 9012",
        "ref _1234_5678_9012_",
        "ref 12345678.",
        "ref １２３４５６７８",
      ].join("\n")
    ),
    [
      "ref ****9012",
      "ref ****9012",
      "ref ****9012",
      "ref ****9012",
      "ref ****9012",
      "ref ****9012",
      "ref ******9012**",
      "ref ****9012",
      "ref `****9012`",
      "ref ~~****9012",
      "ref _****9012_",
      "ref ****5678.",
      "ref ****５６７８",
    ].join("\n")
  );
});

test("masks a number whose dashes are Markdown-escaped", () => {
  assert.equal(maskSource("ref 1234\\-5678\\-9012"), "ref ****9012");
});

test("masks an IBAN, contiguous or grouped, though its digits are glued to letters", () => {
  assert.equal(
    maskSource(
      "IBAN GB29 NWBK 6016 1331 9268 19; pay DE89370400440532013000; Policy GL-2025-77410"
    ),
    "IBAN ****6819; pay ****3000; Policy GL-2025-77410"
  );
});

test("masks two long numbers side by side as one run", () => {
  assert.equal(
    maskSource("Accounts 1234 5678 9012 3456 7890 1234 on file"),
    "Accounts ****1234 on file"
  );
});

test("a long run stops at a clear shape and masks only its own digits", () => {
  assert.equal(
    maskSource("Paid 1234 5678 2026-09-01; ref 1234 5678 555-014-2290"),
    "Paid ****5678 2026-09-01; ref ****5678 555-014-2290"
  );
});

test("masks an account number shaped like a phone or an EIN by its label", () => {
  assert.equal(
    maskSource(
      "**Account:** 5550142290 | Account: 555-014-2290 | Acct-88-1234567 | **Phone:** 5550142290"
    ),
    "**Account:** ****2290 | Account: ****2290 | Acct-****4567 | **Phone:** 5550142290"
  );
});

test("leaves positively identified clear shapes clear, with or without Markdown", () => {
  const clear = [
    "**Phone:** 5550142290, *Tel* `15550142290`, Fax: 555 014 2290",
    "Call +1 (555) 014-2290 or 1-555-014-2290 or +1 555 014 2290",
    "**EIN:** 881234567; __EIN__ `88-1234567`; Employer Identification Number 88 1234567",
    "Due **2026-10-12**, from 10-01-2026 to 01-10-2027",
    "Term 2026-03-01–2027-02-28, or 2026-03-01 - 2027-02-28",
    "Total **$1,212.48**; $ 123456789; 123456789.00; balance 12,345,678.90",
    "Portside, WA **98101-1234**",
    "Filing LLC-2024-0731558, Policy GL-2025-77410, License BL-2026-1093, INV20931",
    "Account ****6615; SSN ***-**-6789",
  ].join("\n");
  assert.equal(maskSource(clear), clear);
});

test("a dash-joined number that is not a plausible date is masked", () => {
  assert.equal(maskSource("ref 2026-13-45"), "ref ****1345");
});

test("masks a labelled SSN through Markdown", () => {
  assert.deepEqual(
    maskedValues(
      "**SSN:** 512406789; `Social security number`: **512 40 6789**"
    ).map((v) => v.masked),
    ["***-**-6789", "***-**-6789"]
  );
});
