# Neighborhood Golf Carts — Shop Board

Shop floor / job board for **Neighborhood Golf Carts** in Covington, LA. Track carts as they move through the shop.

This is **not CartScope**. CartScope (`cart-scope.vercel.app`) is diagnostics. This app is a separate shop board on **https://ngc-shop-board.vercel.app**.

Merging to `main` updates that live URL. Do not attach this repo to the CartScope Vercel project.

## Layout

Each row is split like this:

- **Left (sticky identity column):** customer name + Housecall Pro job number together
- **Right:** Status, Next action, Time expectation, Actions

On tablet/phone, customer + job stay the header / left block; the other fields sit below or to the right.

## Statuses (Housecall Pro jobs pipeline)

Status is a dropdown of the NGC Housecall Pro pipeline stages, in board order:

1. New Job
2. Customer drop off
3. RYAN
4. Deposit Needed
5. Need to Order Materials
6. Waiting on Materials
7. Scheduled
8. Awaiting Queue
9. Shop Queue
10. Awaiting Estimate
11. In Progress
12. Awaiting Payment
13. Completed

Free-text status is a fallback only (Other). Seed rows use these pipeline labels.

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
