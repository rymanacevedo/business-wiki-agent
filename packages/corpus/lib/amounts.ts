import type { LineItem } from "../bible";
import { round2 } from "./format";
import type { Allocation, ExpenseCategory } from "./types";

export interface Totals {
  lines: { item: LineItem; total: number }[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  allocations: Allocation[];
}

/**
 * Line totals, tax on taxable lines, and the Allocation per category: each
 * category carries its own lines plus its share of tax; shipping goes to the
 * first line's category; any rounding cent lands on the largest Allocation.
 */
export function totalsOf(
  items: LineItem[],
  taxRate: number,
  shipping = 0
): Totals {
  const lines = items.map((item) => ({
    item,
    total: round2(item.qty * item.unit),
  }));
  const subtotal = round2(lines.reduce((a, l) => a + l.total, 0));
  const taxableBase = lines
    .filter((l) => l.item.taxable !== false)
    .reduce((a, l) => a + l.total, 0);
  const tax = round2(taxableBase * taxRate);
  const total = round2(subtotal + tax + shipping);

  const byCategory = new Map<
    ExpenseCategory,
    { base: number; taxable: number }
  >();
  for (const l of lines) {
    const c = byCategory.get(l.item.category) ?? { base: 0, taxable: 0 };
    c.base += l.total;
    if (l.item.taxable !== false) c.taxable += l.total;
    byCategory.set(l.item.category, c);
  }
  const allocations: Allocation[] = [...byCategory].map(([category, c]) => ({
    category,
    amount: round2(c.base + c.taxable * taxRate),
  }));
  if (shipping && allocations[0])
    allocations[0].amount = round2(allocations[0].amount + shipping);
  const drift = round2(total - allocations.reduce((a, x) => a + x.amount, 0));
  if (drift !== 0) {
    const largest = allocations.reduce((a, b) => (b.amount > a.amount ? b : a));
    largest.amount = round2(largest.amount + drift);
  }
  return { lines, subtotal, tax, shipping, total, allocations };
}
