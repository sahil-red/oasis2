# Oasis2 — deploy bundle

Lean copy of the repo for **GitHub + Vercel**. No OCR caches, `node_modules`, or secrets.

## What’s included

- Next.js app (`app/`, `components/`, `lib/`)
- Scoring reference data (`data/*.json`, not `data/cache/`)
- Supabase migrations (`supabase/`)
- Scripts (for local ops; Vercel only builds the web app)
- Full `.git` history from `oasis`

## What’s excluded (still in `oasis/` for RCA)

- `node_modules`, `.next`, `.tmp`, `.cache`
- `data/cache/` (OCR + ingredient JSONL checkpoints)
- `ocr-pipeline/.venv`
- `.env.local` — copy manually; never commit

## Vercel setup

1. Push this folder to GitHub (personal machine).
2. Import project in Vercel → root directory `.`
3. Set **Environment variables** (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (if any server routes need admin)
   - Any other vars from `oasis/.env.local.example`
4. Build: `pnpm install` (default) → `pnpm build`
5. Live data comes from **Supabase** (same project as local `.env.local`).

## Local smoke test

```bash
cd oasis2
cp /path/to/your/.env.local .env.local   # from oasis, not committed
pnpm install
pnpm dev
```

## OCR pipeline

Run only from the full `oasis/` folder on your work machine while the backfill job is active.
