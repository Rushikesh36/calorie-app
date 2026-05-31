-- Clean-slate schema: drops the old tables so the DB matches the app code.
-- Run this once in Supabase to wipe legacy rows/columns and recreate the new shape.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS public.daily_insights CASCADE;
DROP TABLE IF EXISTS public.daily_logs CASCADE;
DROP TABLE IF EXISTS public.foods CASCADE;
DROP TABLE IF EXISTS public.weight_logs CASCADE;

-- Resolved food items with nutrition data (populated by Gemini)
CREATE TABLE IF NOT EXISTS foods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  calories    FLOAT NOT NULL,
  protein     FLOAT NOT NULL DEFAULT 0,
  carbs       FLOAT NOT NULL DEFAULT 0,
  fat         FLOAT NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL DEFAULT 'serving',
  is_favourite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per food item logged per day
CREATE TABLE IF NOT EXISTS daily_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meal_slot     TEXT,
  raw_input     TEXT NOT NULL,
  quantity      TEXT,
  display_name  TEXT NOT NULL,
  food_id       UUID REFERENCES foods(id),
  calories      FLOAT,
  protein       FLOAT,
  carbs         FLOAT,
  fat           FLOAT,
  status        TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'resolved'))
);

-- Weight history for the status page
CREATE TABLE IF NOT EXISTS weight_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_kg    NUMERIC(5,2) NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One insights row per calendar date (upserted after each Gemini sync)
CREATE TABLE IF NOT EXISTS daily_insights (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date               DATE NOT NULL UNIQUE,
  best_choice        TEXT,
  skip_suggestion    TEXT,
  intake_assessment  TEXT,
  total_calories     FLOAT,
  total_protein      FLOAT,
  total_carbs        FLOAT,
  total_fat          FLOAT,
  gemini_summary     TEXT,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable basic select/insert/update/delete policies for demo usage. Adjust for production.
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'foods' AND policyname = 'public_select_foods'
  ) THEN
    EXECUTE 'CREATE POLICY public_select_foods ON public.foods FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'foods' AND policyname = 'public_insert_foods'
  ) THEN
    EXECUTE 'CREATE POLICY public_insert_foods ON public.foods FOR INSERT WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'foods' AND policyname = 'public_update_foods'
  ) THEN
    EXECUTE 'CREATE POLICY public_update_foods ON public.foods FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_logs' AND policyname = 'public_select_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_select_logs ON public.daily_logs FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_logs' AND policyname = 'public_insert_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_insert_logs ON public.daily_logs FOR INSERT WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_logs' AND policyname = 'public_update_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_update_logs ON public.daily_logs FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_logs' AND policyname = 'public_delete_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_delete_logs ON public.daily_logs FOR DELETE USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_insights' AND policyname = 'public_select_insights'
  ) THEN
    EXECUTE 'CREATE POLICY public_select_insights ON public.daily_insights FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_insights' AND policyname = 'public_insert_insights'
  ) THEN
    EXECUTE 'CREATE POLICY public_insert_insights ON public.daily_insights FOR INSERT WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'daily_insights' AND policyname = 'public_update_insights'
  ) THEN
    EXECUTE 'CREATE POLICY public_update_insights ON public.daily_insights FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weight_logs' AND policyname = 'public_select_weight_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_select_weight_logs ON public.weight_logs FOR SELECT USING (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weight_logs' AND policyname = 'public_insert_weight_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_insert_weight_logs ON public.weight_logs FOR INSERT WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weight_logs' AND policyname = 'public_update_weight_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_update_weight_logs ON public.weight_logs FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weight_logs' AND policyname = 'public_delete_weight_logs'
  ) THEN
    EXECUTE 'CREATE POLICY public_delete_weight_logs ON public.weight_logs FOR DELETE USING (true)';
  END IF;
END
$$;