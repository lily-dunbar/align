This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Database (Postgres)

Use **Neon** or **Vercel Postgres** in production; both give you a single `DATABASE_URL` for serverless-friendly access.

1. **Neon:** [Neon console](https://console.neon.tech) → create a project → **Connection details** → copy the pooled **URI** into `DATABASE_URL`.
2. **Vercel Postgres:** [Vercel Storage](https://vercel.com/docs/storage/vercel-postgres) → create a Postgres database linked to your app → copy **`POSTGRES_URL`** (or the provided pooled URL) into `DATABASE_URL`.

Then:

```bash
cp .env.example .env.local
# Edit .env.local and paste your DATABASE_URL (and other secrets as you add features).
npm run db:migrate
```

The `db:migrate` script applies SQL in `drizzle/` to your database (requires a non-empty `DATABASE_URL` in `.env.local`). **Save** `.env.local` before migrating; Drizzle reads the file from disk, not unsaved editor buffers.

If you previously applied the old `users`-only migration, the current initial migration **drops `users`** and creates legacy auth tables (`user`, `account`, `session`, `verificationToken`, `authenticator`). If Drizzle reports a migration conflict, truncate the `__drizzle_migrations` table (or reset the dev database) once, then run `npm run db:migrate` again.

### Auth (Clerk)

Sign-in uses **Clerk** with email login UI at:

- `http://localhost:4000/sign-in`
- `http://localhost:4000/sign-up`

Set these in `.env.local`:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `AUTH_URL=http://localhost:4000`

For Vercel production, set the same Clerk keys and `AUTH_URL=https://<your-domain>`.

### Dexcom OAuth (next step)

Configure `DEXCOM_CLIENT_ID` and `DEXCOM_CLIENT_SECRET`, then open:

- `http://localhost:4000/api/integrations/dexcom/connect`

The callback route is:

- `http://localhost:4000/api/integrations/dexcom/callback`

If you see **“Another next dev server is already running”**, stop the old one first (Terminal: `kill` plus the PID it prints, or quit the other Terminal tab that is running `npm run dev`), then run `npm run dev` once.

**Optional:** if you use Docker locally instead, run `docker compose up -d` and set `DATABASE_URL=postgresql://align:align@localhost:54332/align` (see `docker-compose.yml`).

### Apple Shortcuts hourly steps ingest

Steps endpoint format:

- `POST /api/ingest/steps/:stepIngestToken`

Auth:

- Send `Authorization: Bearer <STEPS_INGEST_SECRET>` (or `X-Shortcut-Secret`)

Generate your personal `stepIngestToken` while signed in:

- Open `http://localhost:4000/api/ingest/steps/token`

Body formats accepted:

```json
{ "timestamp": "2026-05-01T15:00:00Z", "steps": 523 }
```

or batch:

```json
{
  "samples": [
    { "timestamp": "2026-05-01T15:00:00Z", "steps": 523 },
    { "timestamp": "2026-05-01T16:00:00Z", "steps": 410 }
  ]
}
```

Shortcut schedule (hourly):

1. iOS Shortcuts → Automation → `+` → **Create Personal Automation**
2. Choose **Time of Day**
3. Pick a start time and set **Repeat: Hourly**
4. Add action **Get Contents of URL**:
   - URL = your `ingestUrl` from `/api/ingest/steps/token`
   - Method = `POST`
   - Headers = `Authorization: Bearer <STEPS_INGEST_SECRET>`
   - Request Body = JSON payload above
5. Turn off "Ask Before Running" for background execution.

Public URL options:

- **Best:** deploy on Vercel and use `https://<your-domain>/api/ingest/steps/:token`
- **Local testing:** use a tunnel (Cloudflare Tunnel / ngrok) and point Shortcut to that HTTPS URL

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
