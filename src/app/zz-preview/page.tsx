"use client";
// TEMPORARY layout preview with mock data — delete this folder.
import FinanceTab from "../admin/tabs/FinanceTab";
import type { FinanceBoard } from "@/lib/finance";

const board: FinanceBoard = {
  partners: [
    { id: 1, name: "Faizan", share_pct: 33.33, receives_fees: true, sort_order: 0 },
    { id: 2, name: "Ali", share_pct: 33.33, receives_fees: false, sort_order: 1 },
    { id: 3, name: "Sara", share_pct: 33.34, receives_fees: false, sort_order: 2 },
  ],
  income: [
    { ym: "2026-09", intake: "Batch 1", amount: 40000, receipts: 10 },
    { ym: "2026-10", intake: "Batch 1", amount: 20000, receipts: 5 },
  ],
  expected: [],
  expenses: [
    { id: 1, spent_on: "2026-09-28", title: "Claude Code (Max)", category: "AI tools", amount: 5600, currency: "USD", foreign_amount: 20, paid_by: 2, recurrence: "monthly", note: null },
    { id: 2, spent_on: "2026-10-05", title: "Domain renewal", category: "Domain & hosting", amount: 3000, currency: "PKR", foreign_amount: null, paid_by: 1, recurrence: "yearly", note: null },
  ],
  transfers: [],
  usdRate: 280,
  today: "2026-10-24",
};

export default function Preview() {
  return (
    <main className="min-h-screen max-w-3xl mx-auto p-4 sm:p-6">
      <FinanceTab board={board} />
    </main>
  );
}
