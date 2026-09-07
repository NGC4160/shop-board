# Neighborhood Golf Carts — Shop Board

Shop floor / job board for **Neighborhood Golf Carts** in Covington, LA. Track carts as they move through the shop.

This is **not CartScope**. CartScope (`cart-scope.vercel.app`) is diagnostics. This app is a separate shop board on **https://ngc-shop-board.vercel.app**.

Merging to `main` updates that live URL. Do not attach this repo to the CartScope Vercel project.

## Layout

Spreadsheet on one page — not a kanban or card board. Every field edits inline. No separate edit modal.

- **Left (sticky identity column):** customer name + Housecall Pro job number together (inline text)
- **Right:** Primary tech, Status, Next action, Time expectation, Actions (delete / add row)

Tablet keeps the same compact table (horizontal scroll). Add row inserts a blank line on this page.

Primary tech, Status, Next action, and Time expectation each have a **dropdown of known options plus a free-text box**. Status dropdown is the full Housecall Pro pipeline; Primary tech dropdown is Field Techs + Unassigned. Other… is always available.

Click a column header to sort. Click again to flip A–Z / Z–A. The last sort is remembered in the browser.

- **Customer name, Primary tech, Next action:** A–Z / Z–A
- **Job number:** numeric-aware (1842 before 18510)
- **Status:** two modes — Housecall Pro pipeline order (New Job before Completed) **and** plain A–Z / Z–A. Click Status to cycle pipeline ▲ → pipeline ▼ → A–Z → Z–A, or use the Pipeline / A–Z buttons.
- **Time expectation:** best-effort date/relative parse (`today`, weekday, `4:00 PM`); otherwise A–Z

## Primary tech

Dropdown of NGC **Field Tech** names from live Housecall Pro (Settings → Team & Permissions). Office Staff and other roles are not included.

- Marlon Gray
- Ryan Gorgoglione
- Hayden Silva

Unassigned is allowed. Seed rows use only these names (Trey Fontenot is unassigned).

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

Seed rows use only these labels.

v1 stores data in the browser (`localStorage`). The first load seeds example carts so the board is not empty. No login.

## Local run

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
