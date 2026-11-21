# LedgerLens — Working Capital Intelligence

A Next.js, React, TypeScript and PostgreSQL application for the DDL Labs assignment `DDL-FIN-001`. The supplied dataset contains 14 CSV files and 2,452 records. Reporting uses **31 December 2025, INR**.

## Live application

[Open LedgerLens](https://ledgerlens-tau-mauve.vercel.app/)

I tested the deployed link in the browser on 21 November 2026. It returned HTTP 200 and rendered the Overview dashboard with the expected financial summary; no failed HTTP responses or page errors were observed during the reload check. This verifies the link and landing page, not every application workflow or provider configuration.

## Implemented

- Six live screens: Overview, Receivables, Payables, Exceptions, Actions and Assistant.
- Transactional schema migrations and snapshot ingestion with source-row references and rejection auditing.
- Invoice/bill balances, partial allocations, evidence, configurable ageing by original, due, posting or last-transaction date, historical balances, daily/monthly movements, concentration, settlement timing and explicitly labelled billing-based days proxies.
- Customer risk, historical customer due-cohort shortfalls, cumulative gaps, overdue trends and a labelled next-month balance illustration.
- Collection opportunities, supplier control review and exceptions with traceable source references.
- Read-only Assistant: validated tool calls, customer-name lookup, retained tool/reference context, live evidence follow-ups, provider fallback and cancellation.
- PostgreSQL-backed request and concurrency limits shared across application instances.

Implementation is not a claim of universal accuracy. The approved isolated verification passes 38 focused checks. A separate live Gemini smoke check confirmed five model-selected tools and the direct customer-risk path against local PostgreSQL. The public link and Overview dashboard were browser-checked on 21 November 2026; other real providers, complete application workflows, mobile/keyboard/microphone behaviour and sustained quota were not exercised.

## Financial snapshot

Verified against an isolated PostgreSQL import of the supplied CSVs on 21 November 2026:

| Metric | INR / count |
|---|---:|
| Net open receivables | ₹3,94,93,294.91 |
| Net open payables | ₹1,65,42,512.87 |
| Net trade balance | ₹2,29,50,782.04 |
| Unallocated receipts | ₹85,000.00 across 3 receipts |
| Overdue receivables | ₹3,25,71,982.61 |
| Capped disputed overdue | ₹92,635.23 |
| Actionable overdue | ₹3,24,79,347.38 |
| Posted payments pending approval | 51 |
| Current exception observations | 489 across 11 populated categories |

An exception count is a count of rule observations, not unique transactions or additive financial exposure. Counts change when source data or validated rules change.

## Run locally

Use Node.js 24.x or 26.x and PostgreSQL. The application uses Neon through a pooled URL; migrations/imports use a direct URL. Optional local PostgreSQL is defined in `compose.yaml`.

```sh
npm ci
cp .env.example .env.local
```

Set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in `.env.local`. For Neon, use the pooled connection for `DATABASE_URL` and the direct connection for `DATABASE_URL_UNPOOLED`, both from the same branch and database. For local PostgreSQL, use the same local connection string for both with `sslmode=disable`. The supplied synthetic CSVs are in `DDL_Labs_WC_Starter_Data/`. Then run:

```sh
npm run db:setup
npm run dev
```

Open http://localhost:3000. For production, run `npm run build` then `npm start`.

`001_finance.sql` creates the source schema. `002_chat_requests.sql` creates the shared request-limit table; **apply both migrations before using Assistant**. The importer atomically replaces the finance source snapshot and import issues; it does not replace operational request-limit records. Never run an import against a database you intend to preserve without reviewing that snapshot-replacement behaviour.

`npm run db:setup` runs migrations followed by an import. Running it again replaces the existing finance snapshot with the CSV files. To use a different dataset, provide all 14 CSVs with the same filenames and headers and run `npm run import:data -- /path/to/csv-directory`. To clear finance data without dropping the schema or chat request records, run `npm run db:reset -- --confirm`. This permanently deletes the imported snapshot and import issues in the database selected by `DATABASE_URL_UNPOOLED`. Run `npm run import:data` to reload the bundled snapshot. Use an isolated database or Neon branch for review.

For optional Docker PostgreSQL, set `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` and optionally `POSTGRES_PORT` in `.env`, run `docker compose up -d postgres`, and point both database URLs at that local instance with `sslmode=disable`. Remote connections enforce certificate verification.

## AI configuration

Configure `GEMINI_API_KEY`, `GROQ_API_KEY` or `OPENAI_API_KEY` on the server. Default routing order is Gemini, Groq, then OpenAI. Current bundled model defaults are `gemini-flash-lite-latest`, `openai/gpt-oss-120b` and `gpt-4o-mini`. Explicit provider selection uses only that provider; recognized questions can still fall back to deterministic live tools.

AI Config also accepts user-supplied Gemini/Groq keys and retrieves account model catalogs through server-side POST requests. Saved keys persist in this browser's localStorage until cleared. Catalog visibility is not proof of completion/tool-calling access or available quota. Credentials are not included in source code or application logs.

A model selects an allowlisted financial tool or clarification action. Arguments are validated; PostgreSQL services compute facts. Financial replies use deterministic service wording rather than an unvalidated model rewrite. Follow-up context contains source references, not trusted amounts. Gemini waits for a response, provider error or caller cancellation without an application timeout. Groq and OpenAI retain an eight-second provider deadline before fallback. Stop cancels provider work; database queries keep their own timeout. Hosting platforms and network transports may still impose limits. Active request-limit leases renew while the provider is working.

Period analysis supports a single 2025 month or two adjacent month-end balances. Nonconsecutive comparisons, partial-date ranges and unsupported relative periods ask for clarification rather than substituting another period. Cash-only investigations load original receipt/payment headers, full allocation audit and source CSV locations; effective balances use the shared reporting cutoff.

Shared limits allow 10 requests per minute and 2 concurrent requests per client identity, with a global 20-request concurrency cap. Vercel's forwarded client identity is trusted automatically. Set `TRUST_PROXY_HEADERS=true` only behind a proxy that overwrites forwarded headers; other environments share a conservative local identity. Public authentication and per-user authorization are not implemented; use access controls before exposing confidential datasets.

## APIs

Successful financial responses use `Cache-Control: no-store`.

| Method/path | Purpose |
|---|---|
| GET `/api/health/database` | Uncached database health |
| GET `/api/finance/summary` | Balances, cash residuals, source counts, pending approvals |
| GET `/api/finance/documents?ledger=ar\|ap` | Validated search, status, pagination and sorting |
| GET `/api/finance/documents/[id]?ledger=ar\|ap` | Source evidence, including inactive audit documents |
| GET `/api/finance/cash/[id]` | Original ARR/APP cash header, approval status, allocation audit and cutoff residual |
| GET `/api/finance/customers?customerId=C030` | Global overdue priorities or a specific master profile |
| GET `/api/finance/history` | Twelve reconstructed monthly closes |
| GET `/api/finance/ageing?ledger=ar&basis=due&boundaries=30,60,90` | Configurable ageing by original/due/posting/last-transaction date |
| GET `/api/finance/analysis?ledger=ar&month=3` | Actual opening/closing bridge, cohorts, daily movements, drivers |
| GET `/api/finance/measures?ledger=ar\|ap` | Coverage-aware measures, timing and concentration |
| GET `/api/finance/opportunities` | Deduplicated collections, cash matching and supplier review |
| GET `/api/finance/exceptions` | Investigations with supported exposure and evidence |
| POST `/api/assistant/chat` | `{question, context?}`; returns reply and validated reference context |
| POST `/api/assistant/models` | Account-visible model suggestions; API key never goes in a GET URL |

## Financial rules and limits

Canonical balances are original face minus eligible allocated cash plus signed posted adjustments. Cash splits are validated before settlement; original invoice dates remain intact. Cancelled/reversed records are excluded from active balances and retained for audit. Invalid/missing source information remains unavailable rather than zero. Historical snapshots use dated events at each cutoff; current-only statuses cannot reconstruct missing historical status transitions.

Due-cohort shortfalls are measured at each cohort's own close. Their cumulative sum is different from today's open debt because later payments may settle old cohorts. The one-month illustration continues the previous three monthly net movements; it is not a forecast or guaranteed cash release.

Formal DSO/DPO and full CCC are unavailable without the required net credit sales/COGS/inventory information. Supported billing-based proxies use actual daily average balances and disclose their denominator. MSME flags inform supplier review; the dataset cannot establish legal acceptance dates or statutory deadlines. Bank/GL/control reconciliation is unavailable because those records were not supplied.

## Verification

```sh
npm run typecheck
npm run lint
npm run build
npm test
```

`npm test` passes 27 CSV arithmetic assertions only. The Webpack production build passes with `npm run build -- --webpack`; this execution host blocks Turbopack's local worker port. For isolated database and mocked-provider integration checks, create an isolated local database with a name beginning `ledgerlens_`, apply migrations and import the starter CSVs there, then:

```sh
VERIFICATION_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/ledgerlens_verify?sslmode=disable' npm run test:integration
```

The integration runner refuses remote/nonverification databases. Adversarial finance fixtures roll back. Operational rate-limit records are cleared in that isolated database. No paid model calls occur: provider responses are mocked. The suite verifies independent CSV totals, historical/daily bridges, exact large amounts, missing data, source conflicts, six scenario routes, follow-up scope, provider failures, in-flight cancellation, reference grounding and limits. Project rules require explicit approval before running tests or browser checks.

## Documentation and delivery

- [Financial rules](docs/financial-rules.md)
- [Data mapping](docs/data-mapping.md)
- [Actual verification report](docs/test-report.md)
- [Executive summary](docs/executive-summary.md)
- [Final presentation](docs/LedgerLens_Final.pptx)
- [Presentation brief](docs/presentation.md)

The supplied dataset is synthetic and included for reproducibility. The public application URL is [https://ledgerlens-tau-mauve.vercel.app/](https://ledgerlens-tau-mauve.vercel.app/). The final eight-slide deck is `docs/LedgerLens_Final.pptx`; its content, speaker notes and file structure were reviewed against the implementation and verification report. Full rendered-slide layout inspection was not completed. The live Gemini code checks and their limits are recorded in the test report.
