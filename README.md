# Calorie Tracker

Modern mobile-first calorie tracker built with Next.js, Tailwind CSS, and Supabase. Track daily food intake, calories, and macros with quick logging, day-scoped editing, and a compact mobile-first UI.

## Features

- **Date-scoped daily logs:** View logs for any date; the dashboard defaults to follow the user's local day and rolls over at local midnight.
- **Edit past logs inline:** Edit label, calories and timestamp for any existing entry (past or present) from the dashboard.
- **Quick-add from catalog:** Add common foods from the built-in meal catalog with one click.
- **Custom one-off entries:** Add free-text entries with calorie values for items not in the catalog.
- **Macro totals:** Header shows aggregated Protein / Carbs / Fat totals for the selected day (macros are estimated from the client meal catalog).
- **Mobile-first responsive UI:** Layout changes ensure the dashboard, top-nav, and status pages render cleanly on small screens.
- **Status / history page:** A status view summarizes logged days with week/month/all-time summaries at `/status`.
- **Optimistic local mode:** If Supabase credentials are not configured, the app supports local optimistic behavior for quick testing.
- **Server actions:** Uses Next.js server actions for data operations: `getLogsInRange`, `addFoodLog`, `addCustomLog`, `updateLog`, and delete operations.

## Quick setup

Prerequisites: Node.js (18+ recommended), a Supabase project (optional for full persistence).

1. Create a Supabase project (optional for local testing).
2. Run the SQL in `supabase/init.sql` in your Supabase project's SQL editor to create the `daily_logs` table and seed data.
   - If you see a schema-cache error, ensure you ran the script in the same project whose URL you placed in your `.env` file, then hard refresh the app after the table finishes creating.
3. Create a root `.env` or `.env.local` file next to `package.json`, then add:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Install dependencies and run the app locally:

```bash
npm install
npm run dev
```

5. (Developer) Typecheck:

```bash
npm run typecheck
```

## Data model notes

- Daily log rows live in the `daily_logs` table and are timestamped. A row may reference a catalog `food_id` (mapped to the client-side meal catalog) or be a custom entry with `custom_name` and `custom_calories`.
- `FoodItem` nutrition estimates are stored server-side in the `foods` table (populated by Gemini sync) and are used to compute macro totals shown in the header when available.

## Developer notes & important files

- Dashboard and editing: [components/calorie-dashboard.tsx](components/calorie-dashboard.tsx)
- Server actions (reads/writes/normalization): [app/actions.ts](app/actions.ts)
- Server-side foods catalog (populated by Gemini and upserts): [supabase/init.sql](supabase/init.sql)
- Shared types: [lib/types.ts](lib/types.ts)
- Status/history UI: [components/status-client.tsx](components/status-client.tsx)
- Top navigation and responsive tweaks: [components/top-nav.tsx](components/top-nav.tsx)
- DB schema and seed: [supabase/init.sql](supabase/init.sql)

Key implementation details:

- The client controls `selectedDate` and a `followToday` mode; add/update operations accept explicit timestamps allowing logs to be assigned to any date.
- The server `normalizeLogRow` function attaches catalog-backed `FoodItem` objects for rows referencing `food_id` so the UI receives complete objects for rendering.

## Caveats & TODO

- Macros are stored on the server in the `foods` table when items are added or resolved via the Gemini sync. Custom one-off entries do not include macro fields — only calories are stored.
- Custom one-off entries do not include macro fields — only calories are stored. If you want macros for custom entries, the UI and DB schema need extending.
- To persist macros at the DB level, add macro columns to the foods table (or include them on daily log rows) and update the server actions and seeds accordingly.

## Next steps (optional)

- Persist macros in the database and read them from the server instead of the client catalog.
- Add UI to enter macros for custom entries.
- Add tests covering server actions and normalization logic.

---

If you'd like, I can commit this README update, add a short migration SQL to persist macros, or open a PR with the changes. Which would you prefer next?
