# LedgerLens verification report

Executed 21 November 2026 against PostgreSQL 18 in a temporary local `ledgerlens_completion` database. `npm run db:setup` applied migrations 001 and 002 and imported the supplied 14 CSVs. Production Neon records were not used. The isolated integration suite used mocked providers; the separate live check below used actual Gemini requests. The temporary PostgreSQL instance was stopped after verification.

## Actual results

`npm test`: **27 CSV arithmetic assertions passed**. `npm run test:integration`: **38 checks passed, 0 failed**. ESLint completed with zero warnings and TypeScript checking passed. The integration script refuses remote databases and databases not named `ledgerlens_*`. Fixtures are transactionally rolled back; operational limiter records are cleared only in the isolated database.

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
| Exception observations | 489; 11 populated categories |
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

The isolated integration suite mocks provider responses. A separate code-only live check used configured Gemini credentials against the temporary local database: receivables growth, collections, short payments, vendor priorities and named exception investigation each received HTTP 200 with the expected model-selected tool and a backend answer containing evidence. Customer risk intentionally routes a resolved customer name directly to the backend; that path also returned its expected answer and evidence. These six checks ran in two batches. They establish those specific paths, not all possible wording, providers, sustained quota or production latency. The deployed public link and Overview page were browser-checked on 21 November 2026; responsive layout, keyboard, microphone and screenshot-based presentation behavior were not exercised. No production latency, universal accuracy, recovery ROI or zero-hallucination guarantee is asserted.

## Regression coverage added for scenario completion

Six additional integration checks retain the original 28 checks and verify:

- Both supplied cross-party printed-reference collisions, category-scoped duplicate selection and exact-issue follow-up.
- Invoice-level collection actions, ranked customer order, capped collection/dispute portions and invoice links.
- Customer receipts, disputes and follow-ups with source locations, chronology warnings, allocation links and exclusion of future events.
- APP00001 approval review attached to API00007, without changing the recorded settled balance.
- Posting and last-transaction ageing against an independent CSV bucket oracle; a future receipt/allocation cannot change current ageing.
- Server model configuration versus explicit browser overrides, with storage simulated in code. March evidence links retain month 3.

Gemini now waits without an application timeout and retains caller cancellation. Other providers keep their eight-second deadline. Collection actions, activity history, supplier approval context, duplicate category handling and month navigation are implemented. TypeScript, lint and the Webpack production build passed after implementation. The regression additions received independent static review.

The new `db:reset` command was reviewed but not executed in this verification. The final eight-slide presentation is included as `docs/LedgerLens_Final.pptx`. Its content, speaker notes and archive structure were reviewed, including the 38 integration-check count. Full rendered-slide layout inspection was not completed. Browser/Playwright checks were explicitly excluded by the user.

## Final cash evidence and period clarification checks

Four further integration checks retain the previous 34 and cover original ARR/APP headers, approval status, references, source record locations and allocation audit; canonical allocated/residual amounts; future/cancelled audit rows and invalid or rejected source coverage; cash API 200/400/404 responses and no-store headers; and unsupported period clarification without provider calls. Single-month and adjacent-month requests retain their actual requested scope. Nonconsecutive named/ISO comparisons, named-day ranges and unsupported relative periods clarify instead of becoming another monthly result. Customer identity is retained in shortfall choices.

The receipt/payment investigation drawer now loads source details instead of stopping at an ID. Raw allocation audit includes inactive and future rows, explicitly separated from cutoff-effective amounts. TypeScript, lint and the Webpack production build passed; no browser or paid-provider checks were used for these final fixes.

Reviewer commands and source are in README and `scripts/verify-completion.ts`. `npm test` reads the bundled CSVs; it is not a production API or model benchmark. Earlier deferral was superseded by approval for the code-only checks above. The deployment link check is documented below; it was limited to the public landing page.

## Deployment verification

On 21 November 2026, I opened the deployed application in the browser: [LedgerLens live application](https://ledgerlens-tau-mauve.vercel.app/). The page returned HTTP 200, displayed the Overview heading and rendered the expected summary balances: receivables ₹3,94,93,294.91, payables ₹1,65,42,512.87 and net trade balance ₹2,29,50,782.04. No failed HTTP responses or page errors were observed during the reload check. This confirms the public link and landing page loaded at the time of the check; financial scenario checks above used isolated local PostgreSQL.
