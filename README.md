# calorie-app

Modern mobile-first calorie tracker built with Next.js, Tailwind CSS, and Supabase.

## What is included

- Supabase SQL init script at `supabase/init.sql`
- Server actions for today's logs and inserts in `app/actions.ts`
- Responsive dashboard UI in `components/calorie-dashboard.tsx`

## Setup

1. Create a Supabase project.
2. Run `supabase/init.sql` in the SQL editor.
	If you still see a schema-cache error, confirm you ran it in the same Supabase project whose URL is in your `.env` file, then hard refresh the app after the table finishes creating.
3. Create a root `.env.local` file next to `package.json`, then add:

	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

	In Supabase, the anon key is the public client key. If your dashboard labels it as a publishable key, use that value for `NEXT_PUBLIC_SUPABASE_ANON_KEY`. You can copy the variable names from [`.env.example`](.env.example) and paste in your project values.

	You can also verify the table by running `select * from daily_logs limit 1;` in the Supabase SQL editor. If that query fails, the table was not created in the connected project.

4. Install dependencies and run the app:

	```bash
	npm install
	npm run dev
	```

## Notes

- The quick-add catalog is seeded from the exact daily diet you provided.
- The UI is optimized for mobile tapping and uses a dark, clean visual style.
- The status page lives at `/status` and supports week, month, and all-time summaries.
