# Neighborhood Golf Carts — Shop Board

Shop floor / job board for **Neighborhood Golf Carts** in Covington, LA. Track carts as they move through the shop.

This is **not CartScope**. CartScope (`cart-scope.vercel.app`) is diagnostics. This app is a separate shop board and must stay on its **own Vercel project and URL**.

## What it tracks

Each cart/job row has five fields:

1. **Customer name**
2. **Job number** (Housecall Pro)
3. **Status**
4. **Next action**
5. **Time expectation** (ETA / due / promised time)

Suggested statuses (editable, or type your own): Waiting for drop-off, In bay, Waiting on parts, Waiting on deposit, Ready for pickup, Done.

v1 stores data in the browser (`localStorage`). The first load seeds a few example carts so the board is not empty. No login.

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

## Deploy on Vercel (separate project from CartScope)

Create a **new** Vercel project. Do not import this repo into the CartScope project.

Suggested project name: **`ngc-shop-board`** (URL will look like `ngc-shop-board.vercel.app`, not `cart-scope.vercel.app`).

1. In Vercel: **Add New… → Project**.
2. Import the `NGC4160/shop-board` GitHub repo (this repo).
3. Framework: **Next.js** (auto-detected). Root directory: repo root.
4. Project name: `ngc-shop-board` (or `shop-board`). Confirm it is **not** `cart-scope`.
5. Deploy.

Or from the CLI in this directory:

```bash
npx vercel link --yes --project ngc-shop-board
npx vercel --prod
```

If you already have CartScope linked, run `vercel link` again here and choose / create **`ngc-shop-board`**. A `.vercel` folder in this repo should never point at CartScope.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Client-side persistence (`localStorage`)
