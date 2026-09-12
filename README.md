# Neighborhood Golf Carts — Shop Board

Shop floor / job board for **Neighborhood Golf Carts** in Covington, LA. Track carts as they move through the shop.

This is **not CartScope**. CartScope (`cart-scope.vercel.app`) is diagnostics. This app is a separate shop board on **https://ngc-shop-board.vercel.app**.

Merging to `main` updates that live URL. Do not attach this repo to the CartScope Vercel project.

## What it does

This is a **shop-floor spreadsheet**, not a kanban and not CartScope.

One dense table on one page. Rows are jobs. Columns are these fields, in this order, always sorted by job number ascending:

1. **#** (sequential board row 1–n)
2. **Date created** (Housecall Pro job `created_at`, America/Chicago; dash when missing — never invented)
3. **Customer name**
4. **Job number**
5. **Primary tech**
6. **Current Status** (Housecall Pro Jobs pipeline dropdown)
7. **Next step** (free text — the existing local `nextAction` field; empty is allowed)
8. **Timeframe** (calendar date picker — a real `YYYY-MM-DD` date, empty/clearable)

Every floor field edits **inline**. There is no top chrome (no Add cart button, toolbar, stats cards, search, or filters), no cart / bay / notes / phone columns, and no details drawer. New carts normally arrive from Housecall Pro morning sync. Press `N` to add one locally — it asks for customer + job # first; the row appears on the sheet only after both are valid.

- **Wall display** at `/wall` for the shop TV (read-only grouping by stage — not an editing board)
- **Keyboard:** `N` add cart locally, `Esc` abandon a blank add
- **Sync** (compact control at the top of the spreadsheet) pulls open Housecall Pro jobs now — same `/api/jobs/hcp` merge as morning sync, forced even after the 7am run. Status shows Syncing…, then job count / last sync time, or the API error. Phones can still pull down to sync.
- **Remove** a row with the trash control on the customer cell (confirm first). Board-only — the Housecall Pro job is not deleted.

Tablet and phone keep the same table (horizontal scroll if needed) so rows stay readable. Row #, Date created, Customer name, and Job number stay sticky on the left.

Customer name and job number are required. Empty or whitespace-only values show an inline error and are not saved. Job numbers must be digits or `17312-1` — not `000` or leading zeros. Duplicates are blocked. `N` opens a compact identity composer — not a board row. The cart only appears on the spreadsheet after both fields are valid. Tap away, Escape, or reload while it is still blank and it disappears. It is not stored. Status Other… cannot be an exact Housecall Pro pipeline name — pick that stage from the list.

Primary tech and Current Status are native `<select>` controls (OS picker on iOS/Android — they do not open the soft keyboard). Each list still ends with **Other…**, which is the only path that shows a text field. Status options are the full Housecall Pro pipeline; Primary tech is Field Techs + Unassigned.

Rows are **always sorted by Housecall Pro job number**, lowest first (numeric-aware: 1842 before 18510). There is no sort-by-customer / tech / status.

## Customer names from Housecall Pro

`customerNameFromHcp` prefers `first_name` + `last_name` when either is present. It never uses the shop name **Neighborhood Golf Carts** (or close variants) as `customerName` — those values fall through to other person / display / company fields. Company is only used when there is no person name. It never invents a name.

Residential customers often have the shop filled as company, which previously made every row show **Neighborhood Golf Carts**. Morning sync overwrites the board customer name by job number when HCP sends a real name, and clears a leftover shop name even if HCP sends an empty one.

## Job numbers

The board job # is Housecall Pro’s **`invoice_number`** — the number HCP shows on the job/invoice in the shop. The public Jobs API has no separate customer-visible job number. `job_number` is only a fallback if a payload includes it. We do not use the HCP UUID `id`.

Live NGC invoices are currently **6-digit** (for example `173128`). The 4-digit examples on the local seed board (`1839`, `1842`) are demo data, not a different HCP field.

## Date created

**Date created** is Housecall Pro’s job `created_at` (ISO 8601 on the Jobs API). Sync maps that field through `/api/jobs/hcp` and stores it as `hcpCreatedAt`. The board shows it as a shop-floor date in **America/Chicago** (for example `Sep 12, 2026`).

If a job has no `created_at`, the cell is **—**. Sync time and the local board `createdAt` (when the row was added here) are never used as a stand-in. A later sync that omits `created_at` keeps a date that was already stored.

## Primary tech

Dropdown of NGC **Field Tech** names from live Housecall Pro (Settings → Team & Permissions). Office Staff and other roles are not included.

- Marlon Gray
- Ryan Gorgoglione
- Hayden Silva

Unassigned is allowed.

## Statuses (Housecall Pro jobs pipeline)

Status is a dropdown of the live NGC Housecall Pro **Jobs** pipeline stages (Pipeline → Jobs), left to right. Labels are exact — no invented names, no hidden/off stages.

1. New Job
2. Customer drop off
3. Pictures Needed
4. Deposit Needed
5. RYAN
6. Need to Order Materials
7. Waiting on Materials
8. Unscheduled
9. Scheduled
10. Return Call Needed
11. In Progress
12. Awaiting Queue
13. Shop Queue
14. JESSE- estimate ready to call
15. Awaiting Estimate
16. Awaiting Approval
17. Awaiting Deposit
18. Awaiting QC
19. Completed
20. Awaiting Payment
21. Awaiting Return Delivery
22. Customer pick up
23. Need to Invoice
24. Invoice Sent
25. On Hold
26. Invoice Paid

v2 stores data in the browser (`localStorage` key `ngc-shop-board-v6`). First load seeds example carts so the board is not empty. Existing v5 boards migrate automatically. No login.

## Housecall Pro morning sync (7:00 AM America/Chicago)

Vercel Cron hits `/api/cron/sync-jobs` at **12:00 UTC and 13:00 UTC**. The handler only runs the Housecall Pro pull when the clock is **7:00 AM in America/Chicago**, so daylight saving does not drift the shop’s 7am refresh.

Each shop tablet/TV then merges that job list into the local board:

- After 7:00 AM Chicago, the first time the board or `/wall` is open (or left open overnight), it fetches `/api/jobs/hcp` and **merges by job number**.
- Housecall Pro updates **job list, customer name, phone**, **Date created** from job `created_at` when the payload includes it, and **pipeline status when the API gives an exact Jobs pipeline name**. Missing `created_at` is stored as empty (shown as —) and is never invented from sync time. **Next step and Timeframe are local/board-only** — HCP does not send or overwrite them.
- Existing wrong customer names (including “Neighborhood Golf Carts” on residential jobs) are overwritten when HCP sends a person name. Empty HCP names are not invented. A leftover shop-as-customer name is cleared instead of kept.
- If the board still has any customer name that is `Neighborhood Golf Carts` or a close variant (the old shop-as-company bug), the next load fetches `/api/jobs/hcp` and re-applies even when `lastHcpSyncAt` is already today. That one merge overwrites those localStorage rows. After it runs, leftover real company names do not refetch every minute.
- Jobs that came from Housecall Pro (or still show the shop as the customer) and are **not** in the open HCP pull drop off the board — finished / canceled / paid-complete work leaves with the sync. Next step and Timeframe are kept only on jobs that remain open. Local-only `N` adds that were never synced from HCP stay.
- **Sync** (or pull-to-refresh) on the spreadsheet forces the same `/api/jobs/hcp` merge even if the board already synced after 7:00 AM today. Morning sync still runs on its own schedule.

## Removing a job from the board

There is no Housecall Pro write from this app (the API key is treated as read-only). Delete is **board-only**:

1. Tap the trash icon on the sticky customer cell (44px target). Confirm **Remove**.
2. The row leaves this device’s `localStorage`. Undo is offered on the toast.
3. That job number is remembered as dismissed, so the next morning sync or pull-to-refresh will not put it back.
4. Press `N` and add the same job # locally if you need the row again (that clears the dismissal).

Use this for stale seed rows, leftover local adds, and jobs that are done in HCP but still sitting on the tablet.

### Required Vercel environment variables

Set these on the **ngc-shop-board** project (Production). See `.env.example`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `HOUSECALL_PRO_API_KEY` | Yes, for live sync | Housecall Pro API key (Admin → My Apps → API Key Management). Prefer **read-only**. `HCP_API_KEY` is accepted as an alias. |
| `CRON_SECRET` | Recommended | Vercel sends `Authorization: Bearer $CRON_SECRET` to the cron route. Without it, only Vercel’s cron user-agent (or local `next dev`) can call the stub. |

Optional: `HOUSECALL_PRO_AUTH_SCHEME=bearer` if the key is a Bearer token instead of `Token <key>`; `HOUSECALL_PRO_COMPANY_ID` for multi-location; `HOUSECALL_PRO_API_URL` (defaults to `https://api.housecallpro.com`).

Without `HOUSECALL_PRO_API_KEY`, job-number sort still ships, and the 7am cron/route still runs as a stub that reports the missing token. Live HCP job refresh is blocked until the key is set.

Generate the key in Housecall Pro (MAX plan, Admin user): **My Apps → API Key Management → Generate API Key**.

## Local run

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Wall display: [http://localhost:3000/wall](http://localhost:3000/wall).

```bash
npm run build
npm start
```

## Deploy

Live site: **https://ngc-shop-board.vercel.app** (Vercel project `ngc-shop-board`).

Merging this repo’s `main` branch updates that deployment. Keep it a **separate** project from CartScope.

If you ever re-link the CLI:

```bash
npx vercel link --yes --project ngc-shop-board
npx vercel --prod
```

A `.vercel` folder in this repo should never point at CartScope.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Client-side persistence (`localStorage`)
