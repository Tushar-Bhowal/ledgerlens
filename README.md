# Working Capital Intelligence

A DDL Labs assignment application for accounts receivable, accounts payable and financial evidence.

## Current progress

The six dashboard screens and shared design components are implemented as a static preview. They include reusable tables and stats, chart and number animations, route skeletons, source-record panels, and a scripted Assistant. Neon is connected through the database health endpoint.

**Static frontend implementation is complete against the current plan; final UI approval is pending.** Detailed customer risk and collections, configurable AR/AP ageing, period movements and due cohorts, AP settlement and payment review, and measures are implemented against a prepared source snapshot. All six scripted Assistant answers include fuller findings, tables and links. Group concentration, ageing-bucket changes, a labelled three-month-based balance illustration and unique-invoice collection opportunities are available. Collection and disputed portions appear separately. Browser/mobile and microphone verification are deferred. Financial schema/import, business APIs, live AI and delivery artifacts remain later stages.

The supplied dataset uses INR and a reporting date of **31 December 2025**. Place the original starter pack at `DDL_Labs_WC_Starter_Data/` before the later import stage. The data folder is excluded from Git and must be supplied separately with the submission.

## Run locally

Use Node.js **26.13.1 LTS**. Node 24 LTS is also supported by the project. With nvm installed, run `nvm install 26.13.1` followed by `nvm use 26.13.1`. The local `.nvmrc` records this version and is excluded from Git.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). The static dashboard runs without credentials. The database endpoint needs a PostgreSQL connection as described below.

## Static dashboard preview

The overview, receivables, payables, risk and exceptions, action queue and assistant pages show a preview of the planned experience. The sample tables support search, sorting, pagination and source-record details; the assistant offers scripted examples and does not call an AI model. The displayed portfolio figures describe the supplied snapshot, and finance tables use a prepared snapshot of all eligible source documents. No business data is fetched from the database yet.

Overview is the landing page. The left column shows headline balances, a month-end AR/AP chart, and sample disputes with links to the supporting records and related holds. The right column places a three-group due-date ageing summary above a searchable invoice list. Expand the summary to see the five original buckets. Ageing and the chart cover the starter dataset. Invoice filters apply to the prepared source records. The same `DataTable` component renders finance tables and tables inside Assistant answers. Each screen supplies its columns, filters, search fields, and default page size. The compact shared footer shows the visible row range, a rows-per-page selector, Page X of Y, and first/previous/next/last buttons. Narrow screens keep previous/next navigation, and empty results disable navigation. Overview, Receivables, and Payables also share `StatCard`. A card can display a plain value or accept a chart. Balance cards use the 2025 month-end series. Assistant is the next navigation item. The top bar menu opens a responsive navigation drawer. It starts closed at every viewport width and closes after a page selection. The overview can open the assistant with a collection question ready to send. Example answers link to source records, and the composer stays in place while the conversation scrolls. Use **Clear conversation** to reset the current conversation.

Try an Assistant question from **Examples** to see the simulated loading steps, a sample answer with figures, and evidence links that open in a new tab. **Stop response** cancels the preview, and **Retry** repeats the latest interrupted request. The Examples menu also offers simulated service and request limit errors. For a clarification example, type “Show overdue balances.”

The Assistant uses the same dark theme and blue accents as the dashboard. Click the microphone to dictate on a supported browser. An animated waveform marks recording, and the composer shows interim text as the browser returns it. Stop dictation manually or pause for five seconds, then edit or send the draft. Voice recognition needs browser permission and a secure context. Browser speech services may process the audio. Typed input is available on every supported app browser.

Browser interaction and visual verification have not been performed. Route skeletons, table empty states and Assistant failure previews are implemented. Detailed finance tabs include simulated loading, empty, error and unavailable states. Shared StateMessage layouts give finance, page failures, empty tables and interrupted chat replies a clear explanation and separate recovery actions. Buttons wrap on narrow screens; empty-table filter reset stays outside the horizontal scroller. The pending acceptance steps and live integration work are listed in the local progress document.

The detailed finance screens use `src/lib/finance-preview.json` as bundled static data. The preview requires no preparation script. The raw starter files remain separately supplied for the later database import. AR and AP tabs let reviewers inspect ageing, monthly and daily movements, due cohorts, settlement timing, concentration, customer profiles and bill controls. The **Preview state** selector exposes failure states for UI review. Measures includes group concentration with member links. Period analysis compares ageing buckets and shows a one-month balance illustration using the last three completed months. Action Queue → Collection opportunities counts each overdue invoice once, separates qualifying disputed portions, and keeps already-received unallocated cash outside the collection total. These values are review scopes, not guaranteed receipts.

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

The database starts empty. The financial schema and starter-data import are still planned for the later implementation stage.

## Database endpoint

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

The setup verification on 19 November 2026 passed the production build and a live HTTP database query against the selected production branch. Financial data import and financial scenario verification belong to the later implementation stages.

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
