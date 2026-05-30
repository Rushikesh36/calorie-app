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

function revalidateLogs() {
  revalidatePath('/');
  revalidatePath('/status');
}

function buildLogPayload(options: {
  label: string;
  calories: number;
  timestamp?: string;
}) {
  const trimmedLabel = options.label.trim();

  if (!trimmedLabel) {
    return null;
  }

  const roundedCalories = Math.round(options.calories);
  const catalogFood = mealCatalogByName[trimmedLabel];

  if (catalogFood && catalogFood.calories === roundedCalories) {
    return {
      food_id: catalogFood.id,
      custom_name: null,
      custom_calories: null,
      timestamp: options.timestamp ?? new Date().toISOString(),
    };
  }

  if (!Number.isFinite(roundedCalories) || roundedCalories <= 0) {
    return null;
  }

  return {
    food_id: null,
    custom_name: trimmedLabel,
    custom_calories: roundedCalories,
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

async function insertLogRow(payload: {
  food_id: number | null;
  custom_name: string | null;
  custom_calories: number | null;
  timestamp?: string;
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

  revalidateLogs();

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

export async function addFoodLog(foodName: string, timestamp?: string): Promise<ActionResult<DailyLogEntry>> {
  const trimmedName = foodName.trim();
  const food = mealCatalogByName[trimmedName];

  if (!trimmedName || !food) {
    return failure('Choose a food before logging it.');
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return failure('Connect NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable logging.');
  }

  const payload = buildLogPayload({
    label: food.name,
    calories: food.calories,
    timestamp,
  });

  if (!payload) {
    return failure('Choose a food before logging it.');
  }

  return insertLogRow(payload);
}

export async function addCustomLog(customName: string, customCalories: number, timestamp?: string): Promise<ActionResult<DailyLogEntry>> {
  const trimmedName = customName.trim();

  if (!trimmedName) {
    return failure('Add a food name for the off-menu item.');
  }

  if (!Number.isFinite(customCalories) || customCalories <= 0) {
    return failure('Calories must be a positive number.');
  }

  const payload = buildLogPayload({
    label: trimmedName,
    calories: customCalories,
    timestamp,
  });

  if (!payload) {
    return failure('Calories must be a positive number.');
  }

  return insertLogRow(payload);
}

export async function updateLog(
  logId: number,
  label: string,
  calories: number,
  timestamp: string,
): Promise<ActionResult<DailyLogEntry>> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return failure('Connect NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable updating entries.');
  }

  const resolvedTimestamp = new Date(timestamp);

  if (Number.isNaN(resolvedTimestamp.getTime())) {
    return failure('Pick a valid date and time for the entry.');
  }

  const payload = buildLogPayload({
    label,
    calories,
    timestamp: resolvedTimestamp.toISOString(),
  });

  if (!payload) {
    return failure('Enter a valid food name and positive calories.');
  }

  const { data, error } = await supabase
    .from('daily_logs')
    .update(payload)
    .eq('id', logId)
    .select('id, food_id, custom_name, custom_calories, timestamp')
    .single();

  if (error || !data) {
    return failure(error?.message ?? 'Failed to update the calorie entry.');
  }

  revalidateLogs();

  return {
    ok: true,
    data: normalizeLogRow(data),
  };
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

  revalidateLogs();

  return { ok: true, data: null };
}