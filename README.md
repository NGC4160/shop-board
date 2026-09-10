# Neighborhood Golf Carts — Shop Board

Shop floor / job board for **Neighborhood Golf Carts** in Covington, LA. Track carts as they move through the shop.

This is **not CartScope**. CartScope (`cart-scope.vercel.app`) is diagnostics. This app is a separate shop board on **https://ngc-shop-board.vercel.app**.

Merging to `main` updates that live URL. Do not attach this repo to the CartScope Vercel project.

## What it does

This is a **shop-floor spreadsheet**, not a kanban and not CartScope.

One dense table on one page. Rows are carts. Columns are fields. Every floor field edits **inline** — customer, job #, flag, year / make / model / color, bay, tech, status, next action, time. No required edit modal. There is no top chrome (no Add cart button, toolbar, stats cards, search, or filters). New carts normally arrive from Housecall Pro morning sync. Press `N` to add one locally — it asks for customer + job # first; the row appears on the sheet only after both are valid.

- **Flags:** Hot / Promised / Waiting — tap the flag on the row, plus a left color bar
- **Aging:** days in the current Housecall Pro stage
- **Advance:** one tap moves the job to the next pipeline status
- **Wall display** at `/wall` for the shop TV (read-only grouping by stage — not an editing board)
- **Undo delete** after removing a row
- **Keyboard:** `N` add cart locally, `Esc` close notes or abandon a blank add

Tablet and phone keep the same table (horizontal scroll) with no header/stats/filters so rows stay on screen. Customer name and job # stay in the sticky left column; a narrow sticky actions column keeps details and delete reachable. Every other field is to the right. Notes, phone, and activity are optional extras in a side drawer. Floor work does not require opening it.

Customer name and job number are required. Empty or whitespace-only values show an inline error and are not saved. Job numbers must be digits or `17312-1` — not `000` or leading zeros. Duplicates are blocked. `N` opens a compact identity composer — not a board row. The cart only appears on the spreadsheet after both fields are valid. Tap away, Escape, or reload while it is still blank and it disappears. It is not stored and does not count as open. Status Other… cannot be an exact Housecall Pro pipeline name — pick that stage from the list.

Primary tech, Status, Next action, Time, Bay, Make, and Color each have a **dropdown of known options plus Other… free text**. Status dropdown is the full Housecall Pro pipeline; Primary tech dropdown is Field Techs + Unassigned.

Rows are **always sorted by Housecall Pro job number**, lowest first (numeric-aware: 1842 before 18510). There is no sort-by-customer / tech / status / next / time, and no Pipeline / A–Z status sort toggles. Status still edits inline.

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
- Housecall Pro updates **job list, customer, phone**, and **pipeline status when the API gives an exact Jobs pipeline name**.
- Tech-entered **next action, time expectation, notes, bay, cart, flags, and assigned tech** are kept.
- Local-only rows (blank add-cart lines, jobs not in the HCP open list) stay on the board.

The public Jobs API’s `work_status` is coarse (`unscheduled` / `scheduled` / `in progress`). Custom pipeline columns such as “Awaiting QC” are applied only when HCP returns that exact name (tag or `pipeline_status`). Otherwise existing shop statuses are left alone; new jobs fall back to Unscheduled / Scheduled / In Progress.

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
