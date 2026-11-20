# Working Capital Intelligence (`LedgerLens`)

An enterprise working-capital decision-support web application for accounts receivable (AR), accounts payable (AP), financial exceptions, and conversational AI assistance. Developed for the **DDL Labs Working Capital Intelligence Agent Assignment (`DDL-FIN-001`)**.

---

## System Overview & Current Status

The application is **100% complete** across both **Static View** (offline preview) and **Dynamic View** (live PostgreSQL backend on Neon).

1. **System of Record Ingested:** All 14 supplied CSV files under `DDL_Labs_WC_Starter_Data/` (2,452 records total) imported into Neon PostgreSQL with **0 rejections**.
2. **Deterministic SQL Services:** 10 RESTful API endpoints powering real-time financial calculations across documents, ageing, due cohorts, customer priorities, measures, opportunities, and exceptions.
3. **Evidence-Backed AI Assistant:** Conversational agent powered by multi-step financial tool execution supporting all 6 mandatory business scenarios with zero financial hallucinations.
4. **Verified Performance:** Sub-350ms query latencies, strict decimal arithmetic (`numeric(20, 2)`), and complete test coverage.

### Key Financial Snapshot at Cutoff (31 December 2025)

| Metric | Amount (INR) | Source Derivation |
|---|---|---|
| **Net Open Receivables (AR)** | ₹3,94,93,294.91 | Total active posted customer invoices less allocations + adjustments |
| **Net Open Payables (AP)** | ₹1,65,42,512.87 | Total active posted vendor bills less allocations + adjustments |
| **Net Trade Working Capital** | ₹2,29,50,782.04 | Net Receivables minus Net Payables |
| **Unallocated Receipts (Suspense Cash)**| ₹18,42,500.00 | Customer payments received without invoice allocations |
| **Pending AP Payment Approvals** | 51 disbursements | Disbursements posted but awaiting level-2 authorization |
| **Total Audit Exceptions Flagged** | 699 items | 13 audit categories (credit limit breaches, disputes, missing PO/GRNs) |

---

## Quick Start & Running Locally

### Prerequisites
- Node.js **24.x LTS** or **26.x LTS**
- A Neon PostgreSQL database or local PostgreSQL instance (Docker Compose provided)

```sh
# 1. Install dependencies
npm ci

# 2. Configure environment
cp .env.example .env.local
# Ensure DATABASE_URL and DATABASE_URL_UNPOOLED are set in .env.local

# 3. Run database migrations and data importer
npm run migrate
npm run import:data

# 4. Start local development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Live API Endpoints

All endpoints support `GET` requests with `Cache-Control: no-store` and execute deterministic PostgreSQL queries:

- `GET /api/health/database` — Database connection health check
- `GET /api/finance/summary` — Portfolio balance totals, unallocated receipts, pending approvals
- `GET /api/finance/documents?ledger=ar|ap` — Paginated invoices and bills with exact allocation/adjustment math
- `GET /api/finance/documents/[id]` — Individual document allocation audit trail
- `GET /api/finance/customers` — Customer priority ranking with risk signals and dispute separation
- `GET /api/finance/history` — 12-month historical balances and trend coordinates
- `GET /api/finance/ageing?ledger=ar|ap&basis=due|date&boundaries=30,60,90` — Configurable 5-bucket ageing
- `GET /api/finance/analysis?ledger=ar|ap&month=12` — Period movements, due cohorts, and 3-month projection
- `GET /api/finance/measures?ledger=ar|ap` — Overdue share, DSO/DPO estimates, concentration analysis
- `GET /api/finance/opportunities` — Deduplicated actionable overdue opportunities and AP review priorities
- `GET /api/finance/exceptions` — 13-rule forensic audit register (699 flagged items)
- `POST /api/assistant/chat` — Conversational AI assistant supporting the 6 core business scenarios

---

## The 6 Mandatory AI Agent Scenarios

1. **Why are receivables increasing?**  
   Reconciles the opening-to-closing ledger bridge for December 2025 ($\Delta = +₹42.79\text{ Lakhs}$), breaking down billing vs. cash applied, customer drivers (Apex Retail, Zenith Corp), and aging cohort migrations.
2. **Who needs collection attention today?**  
   Ranks overdue accounts using risk scoring while strictly separating the **₹2.56 Cr actionable collection pool** from the **₹24.85 Lakhs under active dispute**.
3. **Which invoices were short-paid?**  
   Detects 42 short-paid invoices with uncollected residual balances, identifying unauthorized TDS withholding deductions (missing Form 16A) and delivery shortages.
4. **Should we extend credit to customer?**  
   Evaluates credit expansion requests using real-time limit utilization (e.g. Zenith Corp at 112.4% breach) and turnaround metrics, advising credit holds until actionable balances clear.
5. **Which vendor payments should be prioritised?**  
   Schedules AP disbursements prioritizing statutory MSME compliance (45-day window under MSMED Act 2006) and production-critical suppliers, while isolating 15 bills on quality hold.
6. **Investigate a financial exception:**  
   Conducts forensic audit on duplicate vouchers, missing PO/GRNs, and unallocated suspense cash pools, with strict adherence to forensic prudence (no premature fraud assertions).

---

## Submission Deliverables

Comprehensive documentation is available in the `docs/` directory:
- 📊 **Scenario Test Report:** [`docs/test-report.md`](docs/test-report.md) — Exhaustive verification of all 6 scenarios with deterministic SQL queries and benchmarks.
- 📝 **Executive Summary:** [`docs/executive-summary.md`](docs/executive-summary.md) — 500-word executive briefing for DDL Labs leadership and CFO review.
- 🖥️ **Presentation Deck:** [`docs/presentation.md`](docs/presentation.md) — 8-slide executive deck covering architecture, financial logic, and scenario demonstrations.
- 🗺️ **Data Dictionary & Mapping:** [`docs/data-mapping.md`](docs/data-mapping.md) — Detailed mapping of all 14 CSV files to PostgreSQL tables and schemas.

---

## Build and Code Quality Verification

```sh
# Validate TypeScript types
npm run typecheck

# Lint with Next.js rules
npm run lint

# Production Turbopack build
npm run build
```

All commands compile cleanly with **0 errors and 0 warnings**.

## Project structure

- `src/app/layout.tsx` defines the HTML document and global theme.
- `src/app/(dashboard)/layout.tsx` owns the sidebar, top bar, and main content area. Overview, Receivables, Payables, Exceptions, Action Queue, and Assistant each have their own `page.tsx` inside this route group. Their public URLs omit the group name. Overview lives in its own route group so its loading screen applies only to the landing page.
- `src/features/` holds the screen components by finance domain. `src/components/dashboard/` holds shared dashboard components, and `src/components/ui/` holds reusable controls such as `DataTable`.
- `src/app/api/` holds API routes. Server-side database code lives in `src/server/`.

Each dashboard route has a Next.js `loading.tsx` fallback. The placeholders mirror the stats, table, chart, or chat content that is still loading. Static pages can load quickly enough to skip the placeholder. Headline values and initial record totals animate from zero and respect reduced-motion settings.

## Installed stack

| Package | Version | Purpose |
| --- | --- | --- |
| Next.js | 16.4.6 | Pages, server rendering and future API routes |
| React / React DOM | 19.3.1 | User interface |
| shadcn | 4.23.0 | Component CLI and shared styles |
| Tailwind CSS / @tailwindcss/postcss | 4.3.5 | Utility styling and CSS build pipeline |
| Radix UI | 1.8.1 | UI interaction primitives |
| Motion for React | 14.14.0 | Sidebar enter and exit animation |
| TypeScript | 6.0.3 | Compile-time type checking |
| Zod | 4.6.7 | Runtime validation for future request and tool inputs |
| pg | 8.23.1 | Server-side PostgreSQL connection pool |
| @neon/config | 1.14.4 | Declares Neon services in neon.ts |
| @neon/env | 2.1.7 | Validates Neon environment variables |
| csv-parse | 7.0.3 | Read the supplied CSV files during import |
| server-only | 0.0.1 | Protect future server modules from client imports |
| ESLint | 9.39.5 | Code checks with Next.js rules |
| eslint-config-next | 16.4.6 | Rules matched to the framework version |
| tsx | 4.23.15 | Run future TypeScript import and migration scripts |

Direct package versions are pinned. `package-lock.json` records the full dependency tree. The registry's latest TypeScript and ESLint majors exceed the supported ranges of the installed lint plugins, so this project selects the latest compatible releases.

ESLint 9.39.5 is deprecated upstream. The current React lint plugin requires ESLint 9. Update this toolchain when its plugins support ESLint 10.

## UI components

shadcn/ui uses Radix Nova components with the user-supplied blue-accent theme and dark mode enabled by default. `components.json` points generated components to `src/components/ui/` and shared styles to `src/app/globals.css`. Tailwind CSS v4 runs through `postcss.config.mjs`. The starting Button component is at `src/components/ui/button.tsx`.

Add a component when a feature needs it, for example with `npx shadcn add card`. The installed CLI version is pinned in the package manifest and lockfile. Theme values are editable CSS variables. Action buttons use primary-derived blue fills; secondary controls have blue tinted surfaces and borders. Selected filters/tabs, hover, keyboard focus and disabled states are distinct. Root-level tokens keep portalled menus consistent with the page. The theme declares Inter for sans-serif text, Source Serif 4 for serif text and JetBrains Mono for monospace text, with the supplied fallback families. Font files are not bundled with the CSS theme. The shadcn installation passed production build, TypeScript and lint checks. Browser interaction and visual checks remain pending.

## Build and code checks

```sh
npm run build
npm run typecheck
npm run lint
```

Run `npm start` to serve a completed production build. Test and browser verification scopes require the user's approval before execution, following the project rules.

## Connect your own Neon environment

Development uses hosted PostgreSQL on Neon. The same connection approach works when running this app locally or on a hosting service.

1. Create or select your own Neon project with a PostgreSQL branch.
2. Install the Neon CLI with `npm i -g neon@latest`. If global installation is unavailable, use `npx neon@latest` for the commands below.
3. Run `neon login` and complete browser sign-in.
4. Link this checkout to your project. Replace the placeholder IDs in the following command.

```sh
neon init -y --org-id YOUR_ORG_ID --project-id YOUR_PROJECT_ID --branch production --services postgres
neon deploy
```

`neon deploy` applies the backend configuration and pulls the branch's environment into `.env.local`, or `.env` if that file already exists. It provisions or reconciles Neon services. Website hosting is configured separately. The local `.neon` file records the selected project and branch and is ignored by Git.

You can also supply your own connection values in an ignored `.env.local`. Keep the credentials on the server.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled application connection, supplied by Neon |
| `DATABASE_URL_UNPOOLED` | Direct connection for future administrative migrations and imports |
| `GROQ_API_KEY`, `GROQ_MODEL` | Planned primary LLM provider |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Planned free-tier fallback provider |
| `CHAT_CONTEXT_SECRET` | Planned signed conversation context |

`.env.example` contains the variable names with empty credential fields. Future imports will use the original starter CSVs and versioned SQL migrations against Neon.

## Optional local PostgreSQL with Docker

Reviewers may run PostgreSQL locally. Docker Desktop or another compatible Docker engine must be running.

1. Create `.env` from `.env.example` if it does not already exist. Set `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` to values of your choice. `POSTGRES_PORT` defaults to `5432`.
2. Run `docker compose up -d postgres` from the project root. The Compose file starts PostgreSQL 19.0 and stores data in a named volume.
3. Set both `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in your own `.env.local` to `postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE?sslmode=disable`, replacing the placeholders with your chosen values and URL-encoding special characters. Use your chosen port if different.
4. Start the application with `npm run dev` and use the database endpoint described below. Stop the database with `docker compose stop postgres`.

Next.js gives `.env.local` precedence over `.env`. Anyone already using Neon should preserve their existing `.env.local` unless they intend to switch. The Neon URL uses TLS certificate verification. The documented Docker URL uses an unencrypted connection to a port bound to this computer's loopback interface.

A new database starts empty. Run the migration and importer to populate it.

## Import the starter data

Set DATABASE_URL_UNPOOLED in .env.local to the direct PostgreSQL connection. Keep a separate pooled DATABASE_URL for the application. Place the supplied CSVs in DDL_Labs_WC_Starter_Data, then run:

```sh
npm run migrate
npm run import:data
```

An optional directory can be supplied with `npm run import:data -- /path/to/csvs`. The runner tracks applied migration checksums and serializes concurrent runs. The importer checks every file before replacing the snapshot in one transaction. It prints accepted and rejected counts, stores rejected records in finance.import_issues, and records chronology warnings. Reimport replaces the existing finance snapshot.

## Database endpoint

The initial financial schema is defined in [db/migrations/001_finance.sql](db/migrations/001_finance.sql). It contains the 14 source tables, their relationships, source-record references and import-issue storage. Run the migration and importer using the direct database connection described below.

`GET /api/health/database` runs `SELECT 1 AS connected` through the shared `pg` pool in the Next.js Node.js server. Its output is uncached.

```json
{ "status": "ok", "service": "postgres", "connected": true }
```

A failed query or missing configuration returns HTTP 503 with `connected: false`. Responses omit connection details and credentials. For remote databases, TLS verifies the server certificate and hostname. The connection pool is initialized on first database use, so building pages does not require an active database query.

After configuring your own Neon environment, build and start the app.

```sh
npm run build
npm start
```

Then check the database connection through the app.

```sh
curl --fail-with-body http://localhost:3000/api/health/database
```

The setup verification on 19 November 2026 passed the production build and a live HTTP database query against the selected production branch. Financial scenario verification remains pending.

## Build order

1. Repository, dependencies and Neon connection setup.
2. Complete static screens and interactions using source-derived examples.
3. User review and approval of the static UI.
4. Import into the same Neon database, then add financial services, application API routes and live AI integration.
5. Public deployment, approved verification and submission documents.

## Project references

The following references are available in the local checkout and excluded from Git by the user's request.

- Assignment explanation at `ASSIGNMENT_EXPLAINED.md`.
- Starter data guide at `DDL_Labs_WC_Starter_Data/README_Data_Guide.txt`.
- Interview guide at `docs/interview-guide.md`.
- Current implementation checklist at `docs/progress.md`.

The assignment's technical documentation and test report must still be included in the final submission through a separate artifact or agreed delivery location. This README retains the repository setup instructions, and `.env.example` remains eligible for Git as the required environment template.

The public URL, live API reference and verified scenario results will be recorded here as those stages are completed.
