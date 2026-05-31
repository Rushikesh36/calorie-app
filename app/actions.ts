'use server';

import { revalidatePath } from 'next/cache';
import { getSupabaseClient } from '@/lib/supabase';
import { callGemini } from '@/lib/gemini';
import type { DailyLog, DailyInsight, FoodItem, TopPick, WeightLog } from '@/lib/types';

type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'dinner' | 'night';

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function sumFoodMacros(foods: any[]) {
  return foods.reduce(
    (acc, food) => ({
      calories: acc.calories + (toNumber(food.calories) ?? 0),
      protein: acc.protein + (toNumber(food.protein) ?? 0),
      carbs: acc.carbs + (toNumber(food.carbs) ?? 0),
      fat: acc.fat + (toNumber(food.fat) ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function revalidateLogs() {
  revalidatePath('/');
  revalidatePath('/status');
}

function revalidateStatus() {
  revalidatePath('/status');
}

function mapRowToDailyLog(row: any): DailyLog {
  return {
    id: row.id,
    logged_at: row.logged_at,
    meal_slot: row.meal_slot ?? null,
    raw_input: row.raw_input,
    quantity: row.quantity ?? null,
    display_name: row.display_name,
    food_id: row.food_id ?? null,
    calories: row.calories === null ? null : Number(row.calories),
    protein: row.protein === null ? null : Number(row.protein),
    carbs: row.carbs === null ? null : Number(row.carbs),
    fat: row.fat === null ? null : Number(row.fat),
    status: row.status,
  };
}

function mapRowToWeightLog(row: any): WeightLog {
  return {
    id: row.id,
    measured_at: row.measured_at,
    weight_kg: Number(row.weight_kg),
    note: row.note ?? null,
  };
}

export async function getLogsForDate(date: string): Promise<DailyLog[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .order('logged_at', { ascending: false });

  if (error || !data) return [];
  return data.map(mapRowToDailyLog);
}

export async function getLogsInRange(opts?: { start?: Date; end?: Date }): Promise<DailyLog[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase.from('daily_logs').select('*');

  if (opts?.start && opts?.end) {
    query = query.gte('logged_at', opts.start.toISOString()).lt('logged_at', opts.end.toISOString());
  }

  const { data, error } = await query.order('logged_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRowToDailyLog);
}

export async function getInsightForDate(date: string): Promise<DailyInsight | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.from('daily_insights').select('*').eq('date', date).single();
  if (error || !data) return null;
  return data as DailyInsight;
}

export async function getWeightLogsInRange(opts?: { start?: Date; end?: Date }): Promise<WeightLog[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  let query = supabase.from('weight_logs').select('*');

  if (opts?.start && opts?.end) {
    query = query.gte('measured_at', opts.start.toISOString()).lt('measured_at', opts.end.toISOString());
  }

  const { data, error } = await query.order('measured_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRowToWeightLog);
}

export async function addWeightLog(payload: { weight_kg: number; note?: string | null; measured_at?: string }): Promise<WeightLog | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const insert = {
    weight_kg: payload.weight_kg,
    note: payload.note ?? null,
    measured_at: payload.measured_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.from('weight_logs').insert(insert).select('*').single();
  if (error || !data) {
    console.error('addWeightLog failed', { error, insert });
    return null;
  }

  revalidateStatus();
  return mapRowToWeightLog(data);
}

export async function updateWeightLog(id: string, payload: { weight_kg: number; note?: string | null; measured_at?: string }): Promise<WeightLog | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const update = {
    weight_kg: payload.weight_kg,
    note: payload.note ?? null,
    measured_at: payload.measured_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('weight_logs').update(update).eq('id', id).select('*').single();
  if (error || !data) {
    console.error('updateWeightLog failed', { error, update, id });
    return null;
  }

  revalidateStatus();
  return mapRowToWeightLog(data);
}

export async function deleteWeightLog(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from('weight_logs').delete().eq('id', id);
  if (error) {
    console.error('deleteWeightLog failed', { error, id });
    return false;
  }

  revalidateStatus();
  return true;
}

export async function getTopPicksForTimeSlot(timeSlot: TimeSlot): Promise<TopPick[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const start = new Date();
  start.setDate(start.getDate() - 7);

  const { data, error } = await supabase
    .from('daily_logs')
    .select('display_name, raw_input, logged_at, food_id')
    .gte('logged_at', start.toISOString());

  if (error || !data) return [];

  function inSlot(dateStr: string) {
    const d = new Date(dateStr);
    const h = d.getHours();
    switch (timeSlot) {
      case 'morning':
        return h >= 5 && h <= 10;
      case 'afternoon':
        return h >= 11 && h <= 14;
      case 'evening':
        return h >= 15 && h <= 20;
      case 'night':
        return h >= 22 || h <= 4;
    }
  }

  // fetch favourited foods to filter recommendations to durable favourites
  const { data: favFoods } = await supabase.from('foods').select('name').eq('is_favourite', true);
  const favSet = new Set<string>((favFoods || []).map((f: any) => String(f.name).toLowerCase()));

  const counts: Record<string, { display_name: string; raw_input: string; count: number }> = {};

  for (const row of data) {
    if (!inSlot(row.logged_at)) continue;
    const display = row.display_name ?? '';
    const isFav = row.food_id != null || favSet.has(String(display).toLowerCase());
    if (!isFav) continue; // skip non-favourited items

    const key = display;
    counts[key] = counts[key] || { display_name: display, raw_input: row.raw_input, count: 0 };
    counts[key].count += 1;
  }

  const picks = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 3);
  return picks.map(p => ({ display_name: p.display_name, raw_input: p.raw_input, count: p.count }));
}

export async function searchFoodsInDB(query: string): Promise<FoodItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .ilike('name', `%${q}%`)
    .limit(5);

  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    name: r.name,
    calories: Number(r.calories),
    protein: Number(r.protein),
    carbs: Number(r.carbs),
    fat: Number(r.fat),
    unit: r.unit,
  }));
}

export async function saveFoodToDB(payload: { name: string; calories: number; protein?: number | null; carbs?: number | null; fat?: number | null; unit?: string }): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from('foods').upsert(
    {
      name: payload.name,
      calories: payload.calories,
      protein: payload.protein ?? 0,
      carbs: payload.carbs ?? 0,
      fat: payload.fat ?? 0,
      unit: payload.unit ?? 'serving',
      is_favourite: true,
    },
    { onConflict: 'name' },
  );

  if (error) {
    console.error('saveFoodToDB failed', { error, payload });
    return false;
  }

  return true;
}

export async function updateFoodFavourite(name: string, isFavourite: boolean): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from('foods').update({ is_favourite: isFavourite }).eq('name', name);
  if (error) {
    console.error('updateFoodFavourite failed', { error, name, isFavourite });
    return false;
  }
  return true;
}

export async function getFavouriteFoodsByNames(names: string[]): Promise<string[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !names || names.length === 0) return [];

  const { data, error } = await supabase.from('foods').select('name').in('name', names).eq('is_favourite', true);
  if (error || !data) {
    console.error('getFavouriteFoodsByNames failed', { error, names });
    return [];
  }

  return data.map((r: any) => r.name as string);
}

export async function addPendingLog(payload: { raw_input: string; quantity?: string; display_name: string; timestamp?: string; meal_slot?: string }): Promise<DailyLog | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const insert = {
    raw_input: payload.raw_input,
    quantity: payload.quantity ?? null,
    display_name: payload.display_name,
    meal_slot: payload.meal_slot ?? null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    status: 'pending',
    logged_at: payload.timestamp ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.from('daily_logs').insert(insert).select('*').single();
  if (error || !data) {
    console.error('addPendingLog failed', { error, insert });
    return null;
  }

  revalidateLogs();
  return mapRowToDailyLog(data);
}

export async function deleteLog(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from('daily_logs').delete().eq('id', id);
  if (error) return false;

  revalidateLogs();
  return true;
}

export async function updateLog(id: string, display_name: string, calories: number | null, timestamp?: string, meal_slot?: string): Promise<DailyLog | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const payload: any = {
    display_name,
  };

  if (calories === null) {
    payload.calories = null;
    payload.protein = null;
    payload.carbs = null;
    payload.fat = null;
    payload.status = 'pending';
  } else {
    payload.calories = calories;
    payload.status = 'resolved';
  }

  if (timestamp) payload.logged_at = timestamp;
  if (meal_slot) payload.meal_slot = meal_slot;

  const { data, error } = await supabase.from('daily_logs').update(payload).eq('id', id).select('*').single();
  if (error || !data) return null;
  revalidateLogs();
  return mapRowToDailyLog(data);
}

export async function addResolvedLog(args: { food_id: string; quantity?: string; display_name?: string; timestamp?: string; meal_slot?: string }): Promise<DailyLog | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { food_id, quantity, display_name, timestamp, meal_slot } = args;

  // fetch food nutrition to copy
  const { data: foodRow } = await supabase.from('foods').select('*').eq('id', food_id).single();
  if (!foodRow) return null;

  const insert = {
    raw_input: display_name ?? foodRow.name,
    quantity: quantity ?? null,
    display_name: display_name ?? foodRow.name,
    meal_slot: meal_slot ?? null,
    food_id: food_id,
    calories: foodRow.calories == null ? null : Number(foodRow.calories),
    protein: foodRow.protein == null ? null : Number(foodRow.protein),
    carbs: foodRow.carbs == null ? null : Number(foodRow.carbs),
    fat: foodRow.fat == null ? null : Number(foodRow.fat),
    status: 'resolved',
    logged_at: timestamp ?? new Date().toISOString(),
  };

  let data, error;
  try {
    const res = await supabase.from('daily_logs').insert(insert).select('*').single();
    data = res.data;
    error = res.error;
  } catch (err) {
    console.error('addResolvedLog unexpected error', err, { insert, foodRow });
    return null;
  }

  if (error || !data) {
    console.error('addResolvedLog failed', { error, insert, foodRow });
    return null;
  }

  revalidateLogs();
  return mapRowToDailyLog(data);
}

export async function syncDayWithGemini(date: string, timeOfDay?: string): Promise<{ logs: DailyLog[]; insight: DailyInsight | null }> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase credentials are not configured');

  // 1. fetch logs for date
  const logs = await getLogsForDate(date);
  const resolved = logs.filter(l => l.status === 'resolved');
  const pending = logs.filter(l => l.status === 'pending');

  // 3. build prompt
  const resolvedBlock = resolved.length
    ? resolved.map(l => `- ${l.display_name}: ${l.calories} kcal, P:${l.protein}g C:${l.carbs}g F:${l.fat}g`).join('\n')
    : '(none)';

  const pendingBlock = pending.length
    ? pending.map(l => `- raw_input: "${l.raw_input}"${l.quantity ? ` | quantity hint: "${l.quantity}"` : ''}`).join('\n')
    : '(none)';

  const prompt = `You are a nutrition expert assistant. Given the food log below for ${date}${timeOfDay ? ` (${timeOfDay})` : ''}, do exactly two things:

1. For every PENDING item, determine the total calories and macros (protein, carbs, fat in grams).
   Also break it down into individual foods (e.g. \"3 boiled eggs and 2 egg whites\" → boiled egg × 3, egg white × 2)
   so each food can be stored individually for future use. Include per-unit nutrition for each individual food.
   If the user did not specify quantity, assume quantity = \"1 portion\" (or \"1 serving\" when it reads better).
   Correct obvious spelling mistakes in display_name (for example: \"besan chila\" → \"Besan chilla\").
    Do not use 0 calories or 0 macros for a recognized food item; infer realistic values from nutrition databases.
    The total calories/macros for each resolved item must equal the sum of its foods.
    If a meal time is provided, use it to improve portion inference and keep the response aligned with that meal window.

2. Analyse the COMPLETE day (pending + resolved combined) and produce insights.

RESOLVED items (already have calories):
${resolvedBlock}

PENDING items (need nutrition data):
${pendingBlock}

Respond ONLY with a valid JSON object and nothing else — no markdown, no backticks, no explanation:
{
  "resolved_items": [
    {
      "raw_input": "...",
      "display_name": "...",
      "quantity": "1 portion",
      "calories": 123,
      "protein": 4,
      "carbs": 12,
      "fat": 6,
      "foods": [
        {
          "name": "...",
          "quantity": 1,
          "unit": "portion",
          "calories": 123,
          "protein": 4,
          "carbs": 12,
          "fat": 6
        }
      ]
    }
  ],
  "insights": {
    "best_choice": "",
    "skip_suggestion": "",
    "intake_assessment": "",
    "total_calories": null,
    "total_protein": null,
    "total_carbs": null,
    "total_fat": null,
    "gemini_summary": ""
  }
}`;

  // 4. call Gemini once
  const raw = await callGemini(prompt);
  const clean = raw.replace(/```json|```/gi, '').trim();
  const parsed = JSON.parse(clean);

  // 6. For each resolved pending item, upsert foods and update daily_logs
  const resolvedItems: any[] = parsed.resolved_items || [];

  for (const item of resolvedItems) {
    const normalizedDisplayName = item.display_name || item.raw_input || '';
    const normalizedQuantity = item.quantity || '1 portion';
    const derivedFromFoods = sumFoodMacros(item.foods || []);
    const calories = toNumber(item.calories);
    const protein = toNumber(item.protein);
    const carbs = toNumber(item.carbs);
    const fat = toNumber(item.fat);
    const finalCalories = calories && calories > 0 ? calories : derivedFromFoods.calories;
    const finalProtein = protein && protein > 0 ? protein : derivedFromFoods.protein;
    const finalCarbs = carbs && carbs > 0 ? carbs : derivedFromFoods.carbs;
    const finalFat = fat && fat > 0 ? fat : derivedFromFoods.fat;

    // find the matching daily_log by raw_input or display_name
    const match = pending.find(p => p.raw_input === item.raw_input || p.display_name === item.display_name);
    if (!match) continue;

    const upd = {
      raw_input: item.raw_input || match.raw_input,
      display_name: normalizedDisplayName,
      quantity: normalizedQuantity,
      meal_slot: timeOfDay ?? match.meal_slot ?? null,
      calories: finalCalories,
      protein: finalProtein,
      carbs: finalCarbs,
      fat: finalFat,
      status: 'resolved',
      food_id: null,
    };

    await supabase.from('daily_logs').update(upd).eq('id', match.id);
  }

  // 7. Upsert daily_insights
  const insights = parsed.insights || null;
  if (insights) {
    const up = {
      date,
      best_choice: insights.best_choice || null,
      skip_suggestion: insights.skip_suggestion || null,
      intake_assessment: insights.intake_assessment || null,
      total_calories: insights.total_calories ?? null,
      total_protein: insights.total_protein ?? null,
      total_carbs: insights.total_carbs ?? null,
      total_fat: insights.total_fat ?? null,
      gemini_summary: insights.gemini_summary || null,
      synced_at: new Date().toISOString(),
    };

    await supabase.from('daily_insights').upsert(up, { onConflict: 'date' });
  }

  revalidateLogs();

  const updatedLogs = await getLogsForDate(date);
  const updatedInsight = await getInsightForDate(date);
  return { logs: updatedLogs, insight: updatedInsight };
}