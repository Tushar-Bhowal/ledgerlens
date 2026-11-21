# LedgerLens presentation brief

The final deck is [LedgerLens_Final.pptx](LedgerLens_Final.pptx). This brief records its factual content and authoring guidance; financial values use the supplied reporting snapshot.

Create an editable **eight-slide PowerPoint** for DDL Labs assignment `DDL-FIN-001`. This prompt contains the project explanation, slide text, speaker notes, verified numbers and image placement. Use it as the complete writing brief. Four website screenshots are supplied separately. Use each image once on the slide specified below. Make the other slides with native PowerPoint text, tables and simple shapes. Use a clean dark visual style based on the screenshots, with readable type and generous spacing. Shorten sentences for slide layout when needed, while preserving their meaning and numbers. Include speaker notes from this prompt. Do not invent UI views, financial values, test results, a deployment URL or missing scenario screenshots.

LedgerLens is a finance decision-support application built with Next.js, React, TypeScript and PostgreSQL. It analyses accounts receivable (AR), accounts payable (AP), collection activity, supplier payment controls and financial exceptions. The source is 14 synthetic CSV files with 2,452 records. All displayed financial results use INR and a **31 December 2025** reporting cutoff. The Assistant routes questions to validated backend tools, and the financial services calculate the answers from PostgreSQL records. The six required tool paths were exercised in an isolated local database through deterministic routing. A separate code-only check verified five real Gemini tool selections and the direct customer-risk path; a full browser walkthrough remains unverified.

Use these four files, and no other images:

| Slide | Image file | What it actually shows |
| --- | --- | --- |
| 4 | `docs/screenshots/overview.png` | Overview with AR, AP, net trade balance, ageing, history and invoices |
| 5 | `docs/screenshots/customer-profile.png` | Customer 21 risk profile, balances, credit limit, settlement days and invoice list |
| 6 | `docs/screenshots/receivables-answer.png` | Assistant answer to “Why are receivables increasing?” |
| 7 | `docs/screenshots/credit-limit-exception.png` | Exceptions drawer for `LIMIT-C024`, a credit-limit issue affecting Customer 24 |

Crop an image only to improve legibility. Preserve its labels and values. The Customer 21 profile and `LIMIT-C024` investigation are different records. The credit-limit drawer is an Exceptions view, not an Assistant reply. The images do not show all six Assistant scenarios, so describe the remaining scenarios with text. Avoid a crowded image collage.

## Slide 1 — Working capital decisions from traceable records

**Slide title:** LedgerLens

**Slide subtitle:** Working capital intelligence for receivables, payables and financial exceptions

**On-slide text:** Finance teams need to understand who owes money, which supplier bills need review and why a balance changed. LedgerLens connects transactions, controls and an Assistant to source-backed answers. DDL Labs finance assignment `DDL-FIN-001` · Snapshot 31 Dec 2025 · INR.

**Visual:** Large title and one simple AR-to-AP flow. No screenshot.

**Speaker notes:** The application supports finance review rather than transactions. A reviewer can start with a portfolio figure, move to a customer or supplier and inspect the underlying invoices, allocations and adjustments. The supplied dataset is synthetic. Every amount in this presentation refers to its 31 December 2025 reporting snapshot.

## Slide 2 — Architecture and stack

**Slide title:** From CSV records to an explainable answer

**On-slide flow:** 14 source CSVs → PostgreSQL source tables → TypeScript financial services → Next.js dashboard and Assistant.

**On-slide text:** Tracked migrations create the schema. A transactional importer loads the snapshot. Shared balance calculations handle invoice and bill settlement. The Assistant validates tool selection, calls read-only financial tools and returns service-calculated figures with evidence links. The stack is Next.js 16, React 19, TypeScript and PostgreSQL.

**Visual:** A native PowerPoint flow diagram with four stages. No screenshot.

**Speaker notes:** The original CSV identifiers and row locations remain available for audit. The model selects a permitted tool or asks for clarification; PostgreSQL services calculate financial values. The configured automatic provider sequence is Gemini, Groq and OpenAI, followed by deterministic routing when providers fail or return unusable results. Gemini has no application-imposed response deadline and remains cancellable by the caller. Groq and OpenAI retain eight-second provider deadlines. Hosting and network limits may still apply.

## Slide 3 — Data model and financial rules

**Slide title:** Balances follow allocations and the reporting date

**On-slide text:** Original invoices and bills link to receipts or payments through allocation tables. A partial payment reduces only the allocated portion. Signed adjustments change the outstanding balance. Cancelled and reversed documents remain inspectable while leaving active balances. Unallocated cash is tracked separately. Missing or inconsistent inputs can withhold affected measures.

**Callout:** 2,452 rows imported · 0 rejected · 2 chronology warnings · ₹85,000.00 unallocated in 3 receipts.

**Visual:** A small native diagram showing invoice → allocation ← receipt, plus the equivalent supplier bill relationship. No screenshot.

**Speaker notes:** The core outstanding calculation starts from the document face value, subtracts eligible allocated cash and applies signed adjustments. Date rules prevent cash received after 31 December 2025 from changing the earlier closing balance. Original invoice dates are retained for ageing even after partial settlement. Import warnings remain visible as source-quality evidence.

## Slide 4 — Portfolio and December movement

**Slide title:** ₹3.95 crore receivable and ₹1.65 crore payable

**On-slide figures:** Net AR ₹3,94,93,294.91 · Net AP ₹1,65,42,512.87 · Net trade balance ₹2,29,50,782.04. Overdue AR ₹3,25,71,982.61. Of that, ₹92,635.23 is capped disputed overdue, leaving ₹3,24,79,347.38 for collection review.

**On-slide bridge:** December opening AR ₹3,52,14,000.31 + new postings ₹63,69,153.74 − applied receipts ₹20,89,859.14 + net adjustments ₹0 = closing AR ₹3,94,93,294.91.

**Image:** `docs/screenshots/overview.png`. Give the image enough space for the figures and history chart to remain legible.

**Speaker notes:** Receivables increased by ₹42,79,294.60 during December because postings exceeded applied cash. The actionable overdue figure is a balance requiring review, not a promised recovery amount. The Overview image shows rounded crore values; the exact amounts above come from isolated PostgreSQL verification.

## Slide 5 — Source evidence and decision boundaries

**Slide title:** Move from a risk signal to its invoices

**On-slide text:** The customer profile connects current exposure, overdue amount, credit limit, settlement timing and individual invoices. An Assistant follow-up can retain a validated customer, issue or month reference. The application provides advice and evidence; it cannot initiate or approve payments, change credit limits, write off debt or update ledgers.

**Image:** `docs/screenshots/customer-profile.png`. Caption it “Customer 21 profile and invoice evidence.”

**Speaker notes:** This is a live customer profile view. It shows Customer 21 with ₹16,37,605.24 positive outstanding, ₹15,40,092.18 overdue, a ₹7,50,000 current credit limit and 68.3 settlement days. The source does not contain a history of credit-limit revisions. The image captures an earlier profile view. Current functionality also includes source-referenced receipts, allocation links, disputes and follow-ups; these additions are not visible in the supplied image.

## Slide 6 — Required scenarios 1–3

**Slide title:** Receivables movement, collections and payment shortfalls

**Image:** `docs/screenshots/receivables-answer.png`, labelled “Actual Assistant answer for receivables growth.”

**On-slide scenario text:**

1. **Why are receivables increasing?** The shown answer reports a ₹42,79,294.60 December increase, ₹63,69,153.74 in postings and ₹20,89,859.14 in applied receipts. It also identifies the largest ageing-bucket increase and leading customer contributors.
2. **Who needs collection attention?** The tool ranks customers using overdue exposure, delay, credit utilisation, valid broken promises and disputes. The Assistant returns invoice-level actions for the five leading collection customers, with due dates, collection and disputed portions, proposed actions and source links.
3. **Who pays less than billed?** The tool compares monthly billing, cash received, due cohorts, cumulative shortfalls and overdue trends. A one-month balance illustration continues the mean of three complete months and is labelled as an illustration, not a forecast.

**Speaker notes:** The screenshot supports scenario 1 only. The isolated integration check exercised all three backend tool paths with source links. A separate code-only live Gemini check verified these three provider paths; browser interaction remains unverified. The shortfall calculation distinguishes historical cohort gaps from today's collectible balance because later receipts can settle older invoices.

## Slide 7 — Required scenarios 4–6

**Slide title:** Customer risk, supplier review and exception investigation

**Image:** `docs/screenshots/credit-limit-exception.png`, labelled “Credit-limit investigation in Exceptions.” The drawer shows `LIMIT-C024`, Customer 24, High severity, ₹22,40,121.04 supported amount and source references.

**On-slide scenario text:**

4. **Why is a customer high risk?** The tool resolves a customer ID or full name and reports current limit, terms, overdue invoices and payment timing. Historical limit revisions are unavailable. The screenshot on slide 5 shows a separate Customer 21 profile.
5. **Which supplier payments need priority?** The review considers due bills, supplier criticality, MSME source flags, holds and disputes. Approval warnings on related posted payments require control review without reversing valid recorded settlement; bill-level approval was not supplied. The application does not execute payments.
6. **Investigate an exception.** A named issue returns its reason, supported amount, recommended review and source references. The shown `LIMIT-C024` issue flags a credit-limit breach. The isolated Assistant scenario check used a different issue, `HLD0001`.

**Speaker notes:** The Exceptions image demonstrates a source investigation view. It is not proof that the Assistant answered a question about `LIMIT-C024`. Generic duplicate questions return matching leads for selection. Cross-party printed-reference collisions include linked source documents, and receipt/payment investigations expose original cash headers and allocation audit. Do not claim the app proves fraud or that duplicate detection is fully verified.

## Slide 8 — Verification, limits and delivery

**Slide title:** What was checked and what the data cannot answer

**On-slide text:** On 21 November 2026, 27 CSV arithmetic assertions and 38 isolated PostgreSQL integration checks passed. TypeScript checking and lint passed. The integration checks covered balance arithmetic, history, six deterministic scenario tool paths, evidence, failure handling and mocked provider responses.

**Data limits:** Inventory, COGS, separately identified net credit sales, bank statements, GL balances and credit-limit revision history were not supplied. Formal DSO, DPO, full cash conversion cycle and bank reconciliation are therefore unavailable. Billing-based days values are labelled proxies.

**Verification limits:** Five live Gemini tool selections returned backend answers with evidence; customer risk used direct customer-name lookup. Broader wording, other real providers, sustained quotas, production latency, browser/mobile interaction and public deployment remain unverified. The final presentation is a description of the current application and its measured local checks.

**Visual:** Two-column text layout with a small verification table. No screenshot.

**Speaker notes:** The source data supports detailed AR and AP review, but it cannot establish every accounting or operating metric. The reported test counts reflect local checks against synthetic data. They do not justify a universal accuracy claim or a cash recovery forecast. Close by saying LedgerLens makes working-capital review more traceable and gives finance teams a concrete starting point for investigation.

## Final production instructions

Deliver one editable `.pptx` with exactly eight slides, embedded speaker notes and the four supplied screenshots in their assigned slides. Check spelling, Indian number formatting, screenshot readability and the arithmetic in slide 4. Keep visible slide text concise while retaining the full explanations in speaker notes. Use no additional images or unsupported claims.
