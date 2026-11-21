# LedgerLens verification report

Executed 21 November 2026 against PostgreSQL 18 in a temporary local `ledgerlens_review` database. `npm run db:setup` applied migrations 001 and 002 and imported the supplied 14 CSVs. Production Neon records and external LLMs were not used by these checks. The temporary PostgreSQL instance was stopped after verification.

## Actual results

`npm test`: **27 CSV arithmetic assertions passed**. `npm run test:integration`: **28 checks passed, 0 failed**. ESLint completed with zero warnings and TypeScript checking passed. The integration script refuses remote databases and databases not named `ledgerlens_*`. Fixtures are transactionally rolled back; operational limiter records are cleared only in the isolated database.

| Verified value | Result |
|---|---:|
| Imported source records | 2,452 |
| Rejected source records | 0 |
| Chronology import warnings | 2 |
| Net AR | ₹3,94,93,294.91 |
| Net AP | ₹1,65,42,512.87 |
| Net trade balance | ₹2,29,50,782.04 |
| Unallocated cash | ₹85,000.00 / 3 receipts |
| Total overdue AR | ₹3,25,71,982.61 |
| Disputed overdue AR | ₹92,635.23 |
| Actionable overdue AR | ₹3,24,79,347.38 |
| Exception observations | 487; 10 populated categories |
| Actual average daily AR | ₹2,19,11,328.81 |
| Actual average daily AP | ₹79,20,767.27 |
| AR invoice-billing days proxy | 132.2 days |
| AP purchase-billing days proxy | 110.6 days |

Formal DSO/DPO are unavailable because net credit sales/COGS are not separately supplied. These proxies are not substitutes for those missing denominators.

## Scenario evidence

1. Receivables growth: opening ₹3,52,14,000.31 + postings ₹63,69,153.74 − allocations ₹20,89,859.14 + adjustments ₹0 = closing ₹3,94,93,294.91. Every monthly close and every daily bridge in both ledgers reconciles.
2. Collection attention: actual customer priorities, capped disputes and deduplicated actionable opportunities. FUP0003 is excluded from broken-promise escalation and retained as a chronology flag.
3. Repeated shortfalls: C030 has twelve customer-period rows. Independently calculated cohort shortfalls/cumulative totals and monthly overdue agree with the CSV oracle. Its cumulative cohort shortfall is ₹24,86,930.35; current overdue is ₹17,05,538.24, illustrating why they must remain separate.
4. Customer risk: full-name and ID lookup, missing customers, another customer's follow-up and a master-only profile. No wrong-record substitution.
5. Supplier priorities: actual eligible/blocked source rows and evidence. Human review only; no payment execution. Legal deadlines are not inferred from an MSME flag.
6. Exception investigation: expected tool and HLD0001 identity, source evidence and live context replay.

The scenario check asserts the expected tool, populated facts/tables and source links. It uses deterministic system routing. The exception case is the known hold `HLD0001`; the generic duplicate-invoice prompt and seeded cross-party reference collisions are not covered by that check.

## Adversarial and failure checks

- Independent integer-cent AR/AP CSV totals and all twelve AR history closes.
- Actual daily mean from an independent 365-day integer-cent oracle.
- Configurable date/due ageing totals.
- Pre-year opening fixture; amounts beyond JavaScript safe-integer cents preserve exact SQL totals.
- Null face values withhold metrics instead of becoming zero.
- Late postings retain original-date billing consistently.
- Known future invalid cash does not alter historical coverage.
- Wrong-party and overallocated cash cannot settle an invoice.
- Cancelled source documents remain inspectable and leave active lists.
- Provider abort/direct text/invalid tool responses fall through without ungrounded advisory.
- A model cannot select an unmentioned example invoice.
- March requests retain March; a shortfall follow-up retains its analysis and new customer.
- In-flight Stop prevents the next provider starting.
- PostgreSQL reservations enforce per-client concurrency/sliding-window limits.
- HTTP request shape/context validation and an actual local route-to-service response.

## Limits of this evidence

Provider responses are mocked. Real API credentials, quota, model tool-calling compatibility and wall-clock provider latency are unverified. Browser layout, desktop/mobile, keyboard, microphone, public deployment and screenshot-based presentation demonstrations were not tested. No production latency, universal accuracy, recovery ROI or zero-hallucination guarantee is asserted.

The current Assistant times out a provider after eight seconds, which conflicts with the recorded preference to wait for Gemini until it replies or fails. The checks do not establish that all assignment scenario details are complete. Collection replies lack an invoice-level action list. The customer risk profile omits supplied dispute and follow-up rows. Supplier bill priorities do not connect pending approval of related posted payments to their review. A generic duplicate prompt can return an unrelated exception, and the same-party duplicate rule misses the supplied cross-party reference collisions. A non-December receivables answer links to a December period view. These are recorded in `.phurti/plans/audit-findings-assignment-status.md`.

The new `db:reset` command was reviewed but not executed in this verification. Presentation authoring remains open. `docs/presentation.md` supplies a factual slide brief, and the final PowerPoint still requires actual scenario screenshots.

Reviewer commands and source are in README and `scripts/verify-completion.ts`. `npm test` reads the bundled CSVs; it is not a production API or model benchmark. Real-provider and browser checks were explicitly deferred on 21 November 2026.
