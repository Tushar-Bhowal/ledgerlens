# LedgerLens presentation content

Eight-slide content draft reconciled to isolated verification on 21 November 2026. The existing PPTX is a draft; final export, screenshots and visual validation remain pending.

## 1. Problem and application

- Finance managers need explainable customer collection and supplier payment decisions.
- Six screens cover balances, AR, AP, exceptions, actions and a conversational Assistant.
- Reporting snapshot: 31 December 2025, INR; original supplied source records.

## 2. Architecture and stack

- Next.js, React, TypeScript and PostgreSQL.
- CSV snapshot → transactional importer → source tables → financial services → APIs/screens/tools.
- The LLM selects validated read-only tools; service wording and figures remain deterministic.
- Gemini/Groq/OpenAI routing with bounded provider deadlines and deterministic fallback.

## 3. Data model and processing

- Fourteen source tables, 2,452 records, zero rejected rows and two retained chronology warnings.
- Exact numeric amounts, parent relationships, allocation tables and original CSV locations.
- Checksummed migrations, advisory locks and atomic snapshot replacement.
- Separate operational table for shared request/concurrency reservations.

## 4. Financial calculations

- Net AR ₹3,94,93,294.91; net AP ₹1,65,42,512.87; net trade ₹2,29,50,782.04.
- December AR: ₹3,52,14,000.31 + ₹63,69,153.74 − ₹20,89,859.14 = ₹3,94,93,294.91.
- Canonical dated settlements drive current balances, daily bridges and historical snapshots.
- Actual daily averages replace estimated factors; billing-based days are labelled proxies.

## 5. Six scenario demonstration sequence

- Growth: opening/closing reconciliation and customer/bucket drivers.
- Collections: capped disputes and ranked actionable balances.
- Shortfalls: customer monthly due cohorts, cumulative gaps, overdue trends and labelled illustration.
- Risk: exact customer profile, credit terms and source invoices.
- Supplier priorities: eligible review versus holds/disputes/approval controls.
- Investigation: exact exception identity, exposure and source evidence.
- Final deck requires approved screenshots of the actual app for these demonstrations.

## 6. Findings and recommended reviews

- Overdue AR ₹3,25,71,982.61; disputed ₹92,635.23; actionable ₹3,24,79,347.38.
- Unallocated receipts ₹85,000 across three receipts need matching review.
- Current corrected rules produce 487 observations across ten populated categories.
- Source exceptions are review flags, not evidence of fraud or guaranteed recoverable cash.

## 7. Decisions and limitations

- Validated tools and exact SQL avoid assigning accounting arithmetic to the LLM.
- Follow-up context retains source references and month, not trusted browser amounts.
- Missing data stays unavailable. Formal DSO/DPO, CCC, bank/GL reconciliation and legal acceptance deadlines are unsupported.
- Current statuses cannot reconstruct historical changes without dated history.
- No payment, approval, limit-change, write-off or financial-ledger actions.

## 8. Verification and delivery status

- Twenty-eight isolated integration checks and twenty-seven CSV arithmetic assertions pass.
- Independent source reviews caught and corrected period, scope, cutoff and test-quality gaps.
- TypeScript, lint and Webpack production build pass.
- Real provider, browser/mobile/keyboard/microphone and public deployment verification remain pending.
- Final screenshot-based deck and live walkthrough are release evidence still to complete.
