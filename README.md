# Neighborhood Golf Carts — Shop Board

Shop floor / job board for **Neighborhood Golf Carts** in Covington, LA. Track carts as they move through the shop.

This is **not CartScope**. CartScope (`cart-scope.vercel.app`) is diagnostics. This app is a separate shop board on **https://ngc-shop-board.vercel.app**.

Merging to `main` updates that live URL. Do not attach this repo to the CartScope Vercel project.

## What it does

Spreadsheet on one page — every field still edits inline. No required edit modal.

On top of that v2 adds a real shop-floor command center:

- **Stats strip:** open, hot, due today, parts, unassigned, stuck 3+ days
- **Search** plus filters by tech, hot, due, parts, pickup, stale, closed
- **Cart details:** year / make / model / color, bay, phone, notes, activity log
- **Flags:** Hot, Promised, Waiting — left bar on the row
- **Aging:** days in the current Housecall Pro stage
- **Advance:** one tap moves the job to the next pipeline status
- **Queue view:** jobs grouped by Housecall Pro stage (bottlenecks, not a kanban)
- **Wall display** at `/wall` for the shop TV
- **Export / import JSON**, print, undo delete
- **Keyboard:** `N` add cart, `/` search, `Esc` close details

Tablet uses compact cards. Add cart inserts a blank line. Details open in a side drawer — the main grid stays inline.

Primary tech, Status, Next action, Time, Bay, and Make each have a **dropdown of known options plus a free-text box**. Status dropdown is the full Housecall Pro pipeline; Primary tech dropdown is Field Techs + Unassigned.

Click a column header to sort. Click again to flip A–Z / Z–A. The last sort is remembered in the browser.

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
