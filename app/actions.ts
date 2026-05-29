'use server';

import { revalidatePath } from 'next/cache';
import { mealCatalogByName } from '@/lib/meal-catalog';
import { getSupabaseClient } from '@/lib/supabase';
import type { ActionResult, DailyLogEntry } from '@/lib/types';

function normalizeLogRow(row: any): DailyLogEntry {
  return {
    id: Number(row.id),
    food_id: row.food_id === null ? null : Number(row.food_id),
    custom_name: row.custom_name ?? null,
    custom_calories: row.custom_calories === null || row.custom_calories === undefined ? null : Number(row.custom_calories),
    timestamp: row.timestamp,
    food: null,
  };
}

function failure(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

async function insertLogRow(payload: {
  food_id: number | null;
  custom_name: string | null;
  custom_calories: number | null;
}): Promise<ActionResult<DailyLogEntry>> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return failure('Connect NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable logging.');
  }

  const { data, error } = await supabase
    .from('daily_logs')
    .insert(payload)
    .select('id, food_id, custom_name, custom_calories, timestamp')
    .single();

  if (error || !data) {
    return failure(error?.message ?? 'Failed to record the calorie entry.');
  }

  revalidatePath('/');

  return {
    ok: true,
    data: normalizeLogRow(data),
  };
}

export async function getTodaysLogs(): Promise<DailyLogEntry[]> {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return getLogsInRange({ start: startOfDay, end: endOfDay });
}

export async function getLogsInRange(options?: {
  start?: Date;
  end?: Date;
}): Promise<DailyLogEntry[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('daily_logs')
    .select('id, food_id, custom_name, custom_calories, timestamp')
    .order('timestamp', { ascending: false });

  if (options?.start) {
    query = query.gte('timestamp', options.start.toISOString());
  }

  if (options?.end) {
    query = query.lt('timestamp', options.end.toISOString());
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map(normalizeLogRow);
}

export async function addFoodLog(foodName: string): Promise<ActionResult<DailyLogEntry>> {
  const trimmedName = foodName.trim();
  const food = mealCatalogByName[trimmedName];

  if (!trimmedName || !food) {
    return failure('Choose a food before logging it.');
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return failure('Connect NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable logging.');
  }

  return insertLogRow({
    food_id: null,
    custom_name: food.name,
    custom_calories: food.calories,
  });
}

export async function addCustomLog(customName: string, customCalories: number): Promise<ActionResult<DailyLogEntry>> {
  const trimmedName = customName.trim();

  if (!trimmedName) {
    return failure('Add a food name for the off-menu item.');
  }

  if (!Number.isFinite(customCalories) || customCalories <= 0) {
    return failure('Calories must be a positive number.');
  }

  return insertLogRow({
    food_id: null,
    custom_name: trimmedName,
    custom_calories: Math.round(customCalories),
  });
}

export async function deleteLog(logId: number): Promise<ActionResult<null>> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return failure('Connect NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable deleting entries.');
  }

  const { error } = await supabase.from('daily_logs').delete().eq('id', logId);

  if (error) {
    return failure(error.message ?? 'Failed to delete the log entry.');
  }

  revalidatePath('/');

  return { ok: true, data: null };
}