# Reconciliation Dashboard

Reconciles a store's order export against its payment processor export,
classifies every way the two disagree, and quantifies the money involved.

Full documentation — data findings, reconciliation rules, setup, architecture
and LLM approach — is written up at the end of the build.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase and OpenAI values
npm run dev
```

Apply `supabase/migrations/0001_init.sql` to your Supabase project before the
first run.
