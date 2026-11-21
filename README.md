# LedgerLens — Working Capital Intelligence

A Next.js, React, TypeScript and PostgreSQL application for the DDL Labs assignment `DDL-FIN-001`. The supplied dataset contains 14 CSV files and 2,452 records. Reporting uses **31 December 2025, INR**.

## Live application

[Open LedgerLens](https://ledgerlens-tau-mauve.vercel.app/)

I tested the deployed link in the browser on 21 November 2026. It returned HTTP 200 and rendered the Overview dashboard with the expected financial summary; no failed HTTP responses or page errors were observed during the reload check. This verifies the link and landing page, not every application workflow or provider configuration.

## Clone and run locally

### Requirements

- Git
- [Node.js 24.x or 26.x](https://nodejs.org/en/download) with npm
- [Docker Desktop or Docker Engine](https://docs.docker.com/get-docker/) with Docker Compose (recommended for local PostgreSQL)
- Optional: a Neon account instead of local PostgreSQL, and an AI provider key for model-assisted Assistant routing

### 1. Clone and install

```sh
git clone https://github.com/Tushar-Bhowal/ledgerlens.git
cd ledgerlens
npm ci
cp .env.example .env.local
```

`.env.local` is ignored by Git. Keep credentials there; do not commit or email this file.

### 2. Choose a database

#### Option A: local PostgreSQL with Docker

Edit `.env.local` and set these local-only values. Use the same username, password, database and port in both URLs. This example password is for local development only; replace it with a password of your own. If you use special characters in a password, URL-encode them in the connection URLs.

```dotenv
POSTGRES_USER=ledgerlens
POSTGRES_PASSWORD=replace_with_a_local_password
POSTGRES_DB=ledgerlens_local
POSTGRES_PORT=5432

DATABASE_URL=postgresql://ledgerlens:replace_with_a_local_password@127.0.0.1:5432/ledgerlens_local?sslmode=disable
DATABASE_URL_UNPOOLED=postgresql://ledgerlens:replace_with_a_local_password@127.0.0.1:5432/ledgerlens_local?sslmode=disable

# Gemini API key and Gemini model ID
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-lite-latest

# Groq Cloud API key and model ID served through Groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
```

Start PostgreSQL and confirm that it is ready:

```sh
docker compose --env-file .env.local up -d postgres
docker compose --env-file .env.local exec postgres pg_isready -U ledgerlens -d ledgerlens_local
```

The database files persist in a Docker volume. `docker compose --env-file .env.local down` stops PostgreSQL and keeps the data; `docker compose --env-file .env.local down -v` also deletes the local database volume.

If PostgreSQL is already installed on your computer, create a local database and user yourself, then set both database URLs to that connection with `sslmode=disable`. The `POSTGRES_*` variables are only used by Docker Compose.

#### Option B: Neon PostgreSQL

Create a Neon project and database, then open the project's **Connect** dialog. Select the same branch and database for both connection strings:

- Put the **pooled** connection string in `DATABASE_URL` (application runtime).
- Put the **direct/unpooled** connection string in `DATABASE_URL_UNPOOLED` (migrations and imports). It must not use a `-pooler` hostname.

Keep the SSL settings supplied by Neon. Do not copy connection strings from different branches or databases. Leave the `POSTGRES_*` variables unused and do not start the Docker database. Continue with step 3; `npm run db:setup` uses the direct URL, and `npm run dev` uses the pooled URL. Use a development branch because the import replaces its finance snapshot.

### 3. Apply migrations and load the supplied data

From the repository root, run:

```sh
npm run db:setup
```

This applies the numbered SQL migrations in `db/migrations/`—`001_finance.sql` creates the finance schema and `002_chat_requests.sql` creates shared Assistant request limits—and imports the 14 bundled CSV files from `DDL_Labs_WC_Starter_Data/`. No manual SQL setup is needed. The migration runner records checksums, skips unchanged migrations that were already applied, and stops if an applied migration has been edited.

> **Data warning:** the import replaces the finance snapshot and import-issue records in the database selected by `DATABASE_URL_UNPOOLED`. Re-running `npm run db:setup` reloads the bundled dataset; use a new local database or Neon branch for review, not a database whose finance data you need to preserve.

To run the steps separately, use `npm run migrate` for schema migrations and `npm run import:data` for the bundled CSV import. To import a replacement dataset, provide all 14 CSV files with the same filenames and headers:

```sh
npm run import:data -- /path/to/csv-directory
```

`npm run db:reset -- --confirm` permanently deletes the imported finance snapshot and import issues in the database selected by `DATABASE_URL_UNPOOLED`. It does not drop the schema. Review the script and confirm the target database before running it.

### 4. Start the application

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To run a production build locally:

```sh
npm run build
npm start
```

### Environment variables

The tracked [.env.example](.env.example) lists the supported variables. Copy it to `.env.local`, then fill in the values for the database option you chose. Database URLs and provider keys are credentials; never commit them.

| Variable | Required? | What to set and where to get it |
|---|---|---|
| `DATABASE_URL` | Yes | Runtime PostgreSQL URL. For local PostgreSQL, build it from your local user, password, host, port and database. For Neon, copy the **pooled** URL from the project's Connect dialog. |
| `DATABASE_URL_UNPOOLED` | Yes for setup/import/reset | Direct PostgreSQL URL for migrations, imports and reset. For local PostgreSQL, use the same URL as `DATABASE_URL`. For Neon, copy the **direct/unpooled** URL for the same branch and database; do not use a pooler URL. |
| `POSTGRES_USER` | Docker only | A local database username you choose; Compose passes it to the Postgres container. |
| `POSTGRES_PASSWORD` | Docker only | A local-only password you choose. Use the same password in both connection URLs; URL-encode special characters there. |
| `POSTGRES_DB` | Docker only | A local database name you choose. |
| `POSTGRES_PORT` | Docker only | Host port for local PostgreSQL; defaults to `5432`. If you change it, update both URLs to use the same port. |
| `GEMINI_API_KEY` | Optional | Credential for the Gemini API; get a key from [Google AI Studio](https://aistudio.google.com/app/apikey). |
| `GEMINI_MODEL` | Optional | Gemini model ID used with `GEMINI_API_KEY`; defaults to `gemini-flash-lite-latest`. |
| `GROQ_API_KEY` | Optional | Credential for Groq Cloud (not xAI Grok); get a key from [Groq Console](https://console.groq.com/keys). |
| `GROQ_MODEL` | Optional | Model ID served through the Groq API with `GROQ_API_KEY`; defaults to `openai/gpt-oss-120b` (GPT-OSS hosted by Groq). |
| `OPENAI_API_KEY` | Optional | OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys); used after Gemini and Groq in automatic fallback. |
| `TRUST_PROXY_HEADERS` | Usually leave `false` | Set to `true` only when deployed behind a trusted proxy that overwrites forwarded client-IP headers. Vercel is detected automatically. |
| `VERIFICATION_DATABASE_URL` | Integration checks only | Set in the shell when running `npm run test:integration`. It must point to an isolated local database whose name begins with `ledgerlens_`; remote databases are refused. |

The dashboard and deterministic financial tools do not require AI provider keys. Without an available provider, the Assistant can still handle supported deterministic routes and may ask for clarification when it cannot identify a supported request. For the setup described here, configure Gemini and/or Groq. The code also supports an optional OpenAI fallback; xAI Grok is not integrated. Gemini and Groq keys can also be entered in AI & Model Settings; those user-supplied keys are stored in that browser's localStorage until cleared.

For Vercel, add the runtime database URL and any server-side AI keys in the project's Environment Variables settings. Run migrations/imports separately with the direct database URL; do not configure an automatic deployment step to run `npm run db:setup`, because its importer replaces the finance snapshot.

### Troubleshooting

- **`DATABASE_URL is required`:** set a valid PostgreSQL URL in `.env.local`; restart `npm run dev` after changing it.
- **Connection refused:** confirm PostgreSQL is running, the mapped port matches both URLs, and the database exists.
- **Migration/import says to use a direct connection:** set `DATABASE_URL_UNPOOLED` to a direct URL without `-pooler`.
- **Invalid URL or authentication failure:** confirm username/password/database match the database, and URL-encode reserved characters in credentials.
- **Assistant has no model-backed answers:** configure at least one provider key, or use the deterministic supported questions.

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

## AI configuration

Server-side provider keys are optional. Automatic routing tries Gemini, then Groq, then the optional OpenAI fallback. OpenAI uses `gpt-4o-mini`; Gemini and Groq model defaults are listed in the environment variable table. Explicit provider selection uses only that provider; recognized questions can still fall back to deterministic live tools.

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
npm test
npm run build
```

`npm test` runs 27 CSV arithmetic assertions and does not require a database. The production build is `npm run build`; if your environment blocks Turbopack's local worker port, `npm run build -- --webpack` is a validated alternative.

The integration suite uses a separate local database whose name begins with `ledgerlens_`. With the Docker setup above, create and prepare one as follows (replace the username, password and port if you changed the example values):

```sh
docker compose --env-file .env.local exec postgres createdb -U ledgerlens ledgerlens_verify
export VERIFICATION_DATABASE_URL='postgresql://ledgerlens:replace_with_a_local_password@127.0.0.1:5432/ledgerlens_verify?sslmode=disable'
DATABASE_URL_UNPOOLED="$VERIFICATION_DATABASE_URL" npm run db:setup
npm run test:integration
```

`VERIFICATION_DATABASE_URL` must be set in the shell for the integration command; it must point to `localhost` and a database named `ledgerlens_*`. The runner refuses remote or other databases. Run it only against a disposable verification database: test fixtures roll back, but operational rate-limit records in that database are cleared. Provider responses are mocked, so no paid model calls occur. The suite covers independent CSV totals, historical/daily bridges, exact large amounts, missing data, source conflicts, six scenario routes, follow-up scope, provider failures, cancellation, reference grounding and limits.

## Documentation and delivery

- [Financial rules](docs/financial-rules.md)
- [Data mapping](docs/data-mapping.md)
- [Actual verification report](docs/test-report.md)
- [Executive summary](docs/executive-summary.md)
- [Final presentation](docs/LedgerLens_Final.pptx)
- [Presentation brief](docs/presentation.md)

The supplied dataset is synthetic and included for reproducibility. The public application URL is [https://ledgerlens-tau-mauve.vercel.app/](https://ledgerlens-tau-mauve.vercel.app/). The final eight-slide deck is `docs/LedgerLens_Final.pptx`; its content, speaker notes and file structure were reviewed against the implementation and verification report. Full rendered-slide layout inspection was not completed. The live Gemini code checks and their limits are recorded in the test report.
