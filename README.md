# Evenly

The free, open bill splitter. Scan a receipt, tap who had what, and Evenly does the math and gets everyone back to even. Multi-currency trips, itemized splits, and honest settle-up, with no caps, no ads, and no per-feature paywall.

**Live: [evenly.app.space](https://evenly.app.space)** · MIT · Built on the [DeepSpace SDK](https://docs.deep.space)

## Quick start

Deploy your own copy in three commands:

```sh
npm install
npx deepspace login     # one-time, opens a browser tab
npx deepspace deploy    # -> <name>.app.space
```

Auth, the database, real-time sync, file storage, AI, cron, and hosting all come from DeepSpace, so there is nothing else to configure. Your subdomain is the `name` field in `wrangler.toml`; change it for your own deployment.

Run it locally instead:

```sh
npm install
npx deepspace login
npx deepspace dev       # http://localhost:5173
```

## Commands

| Command | What it does |
|---|---|
| `npx deepspace dev` | Local dev server (Vite + Worker, HMR on `:5173`) |
| `npx deepspace deploy` | Deploy to `<name>.app.space` |
| `npx deepspace test` | Playwright smoke + API/E2E specs |
| `npm run test:unit` | Unit tests (vitest) |
| `npm run type-check` | `tsc --noEmit` |

## Features

- **AI receipt scan to itemized split.** Photograph a receipt, it becomes line items, tap who had each one (shared items split among the tappers), tax and tip distribute proportionally, and a live check reconciles to the printed total. You review every line before anything is added.
- **Split any way.** Equal, exact amounts, percentages, shares, by item, treat, plus per-person adjustments, multiple payers, and tax, tip, fees, and discounts. Penny exact every time.
- **Real-time groups.** Balances update live across everyone in a group, backed by a Durable Object.
- **True multi-currency.** Each expense keeps its own currency with the exchange rate snapshotted at entry, so past balances never move when rates change.
- **Settle to even.** The fewest payments to square up (or the raw who-owes-whom), with one-tap hand-off to Venmo, PayPal, Cash App, or UPI.
- **More.** Friends and 1:1 ledgers, an activity feed, spending insights, recurring expenses, Splitwise CSV import, and CSV / PDF export.

Evenly self-hosts on your own DeepSpace account, so you pay only what the platform costs to run (pass through, no markup).

## How it works

A DeepSpace app on Cloudflare Workers.

- **Money is integer minor units end to end** with a pure, deterministic split engine (`src/lib/split`); every division reconciles to the exact total (largest remainder), and balances are a derived function of the ledger, never a stored mutable number.
- **Member-scoped real time.** Group data is readable only by its members (server enforced), and every privileged write goes through an authorized, audited server action, never a raw client write.
- **AI receipt parsing** runs through the DeepSpace integration proxy (Claude vision); the parsed total reconciles to the printed total, and images live in R2.

Groups, expenses, settlements, members, receipts, comments, and activity live in DeepSpace record collections with per-collection access rules, so a user only ever reads the groups they belong to.

## Tests

- **Unit tests** (vitest): the split engine across every split type, derived balances and settle plans, FX snapshotting, activity day-grouping, and CSV statement rendering.
- **E2E** (Playwright): the landing demo, every split type end to end, a live AI receipt scan, real-time two-user sync, the member-scoped write boundary, settle up, CSV import, recurring expenses, and comments, run against real auth.

## License

MIT. See [LICENSE](./LICENSE).
