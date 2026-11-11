# Group Expense Splitter

[![CI](https://github.com/ottonielmorais2008-rgb/group-expense-splitter/actions/workflows/ci.yml/badge.svg)](https://github.com/ottonielmorais2008-rgb/group-expense-splitter/actions/workflows/ci.yml)

A small web app for splitting group expenses. Create a group, add people by name, record who paid, and see balances plus a short list of who should pay whom.

**Live demo:** _pending deploy_

## What it does

- Sign up or sign in with email and password.
- Create a group that only you can see.
- Add members by name (they do not need an account).
- Add an expense with a payer, an amount, and the members who share it equally.
- See each person's balance and a minimal settlement list.

Amounts are stored as integer cents and shown with two decimal places. The currency is whatever the group agrees on.

## Stack

- React, TypeScript, and Vite
- Supabase Auth (email and password) and Postgres
- Row Level Security so a signed-in user can only read and change their own groups
- Vitest for the settlement math, with GitHub Actions running typecheck, tests, and the production build

## Data model

- `groups`: name and the user who created it
- `group_members`: display names that belong to a group
- `expenses`: description, amount in cents, and the member who paid
- `expense_participants`: the members included in an equal split

Payers and participants must belong to the same group. That rule is enforced by triggers as well as by the application.

## Security notes

Every table in `public` has Row Level Security enabled. Policies allow the `authenticated` role to access a row only when the current user owns the parent group. Helper functions live in a private schema and run as `security definer` so the policies can check ownership without recursive RLS issues.

The browser only uses the public Supabase URL and the publishable (anon) key. No service-role key is included in the app or this repository.

Hosted Supabase projects confirm emails by default, and this project has no custom SMTP. A database trigger auto-confirms new users so sign-up works without waiting for a confirmation email. This is fine for a public demo, but it means email addresses are not verified.

## Tests and CI

GitHub Actions runs typechecking, the Vitest suite, and the production build on every push and pull request. The tests cover:

- Equal splits and remainder cents (rounding that still sums to the original amount)
- Expenses that do not include every member
- A payer who is not in the split
- Settlement minimisation (at most n-1 transfers, two-debtor and two-creditor cases)
- Deterministic results when member order changes
- Parsing and formatting of decimal amounts

## Run locally

```bash
cp .env.example .env.local
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm ci
npm test
npm run dev
```

The dev server listens on `http://127.0.0.1:5173/`. Use that address only when running the app on your own machine; the public demo is the live link above.

## What went wrong

_To be filled after implementation._

## License

MIT
