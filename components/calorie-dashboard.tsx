'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { addCustomLog, addFoodLog, deleteLog, updateLog } from '@/app/actions';
import { dailyCalorieTarget, mealCatalog, mealCatalogByName } from '@/lib/meal-catalog';
import type { DailyLogEntry } from '@/lib/types';

type CalorieDashboardProps = {
  initialLogs: DailyLogEntry[];
  canPersist: boolean;
};

type TimeOfDayKey = 'morning' | 'afternoon' | 'evening' | 'night';

type TimeOfDayBucket = {
  key: TimeOfDayKey;
  label: string;
  helper: string;
  hours: [number, number];
  itemNames: string[];
};

type LogDraft = {
  label: string;
  calories: string;
  timestamp: string;
};

const timeOfDayBuckets: TimeOfDayBucket[] = [
  {
    key: 'morning',
    label: 'Morning',
    helper: 'Breakfast and pre-workout',
    hours: [5, 11],
    itemNames: [
      'High-Protein Overnight Oats',
      'Morning Tea',
      'Parle-G Biscuits',
      'Boiled Eggs',
      'Apple',
      'Caffè Nero Coffee',
    ],
  },
  {
    key: 'afternoon',
    label: 'Afternoon',
    helper: 'Lunch and mid-day fuel',
    hours: [12, 16],
    itemNames: ['Vegetable Soya Pulao', 'Chobani Yogurt', 'Homemade Dry Fruit Barfi', 'Protein Shake'],
  },
  {
    key: 'evening',
    label: 'Evening',
    helper: 'Main dinner plates',
    hours: [17, 20],
    itemNames: [
      'Air-Fried Chicken Breast',
      'Cooked White Rice',
      'Cooked White Rice (veg portion)',
      'Cooked Dal',
      'Cooked Dal (veg portion)',
      'Whole Wheat Roti',
      'Soya Chunks',
      'Whole Egg Bhurji',
      'Whole Wheat Bread',
      'Air-Fried Mixed Veggies',
    ],
  },
  {
    key: 'night',
    label: 'Night',
    helper: 'Late meal or final top-up',
    hours: [21, 4],
    itemNames: [
      'High-Protein Overnight Oats',
      'Morning Tea',
      'Apple',
      'Protein Shake',
      'Whole Wheat Roti',
      'Air-Fried Mixed Veggies',
      'Caffè Nero Coffee',
    ],
  },
];

function getAutoTimeOfDay(): TimeOfDayKey {
  const hour = new Date().getHours();

  if (hour >= 5 && hour <= 11) {
    return 'morning';
  }

  if (hour >= 12 && hour <= 16) {
    return 'afternoon';
  }

  if (hour >= 17 && hour <= 20) {
    return 'evening';
  }

  return 'night';
}

function formatCalories(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatMacro(value: number) {
  return `${formatCalories(value)}g`;
}

function getTimeOfDayBucket(key: TimeOfDayKey) {
  return timeOfDayBuckets.find((bucket) => bucket.key === key) ?? timeOfDayBuckets[0];
}

function getItemNamesForBucket(bucket: TimeOfDayBucket) {
  return bucket.itemNames;
}

function getLocalDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA').format(date);
}

function getDateFromKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function formatDateTimeInputValue(timestamp: string) {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildTimestampForSelectedDate(dateKey: string) {
  const now = new Date();
  const [year, month, day] = dateKey.split('-').map(Number);
  const timestamp = new Date(now);

  timestamp.setFullYear(year, month - 1, day);
  timestamp.setSeconds(0, 0);

  return timestamp.toISOString();
}

function formatDateKeyLabel(dateKey: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(getDateFromKey(dateKey));
}

function getFoodName(log: DailyLogEntry) {
  return log.food?.name ?? log.custom_name ?? 'Custom item';
}

function getRecommendedMeals(meals: typeof mealCatalog[number]['items'], calorieRoom: number) {
  const sortedMeals = [...meals].sort((left, right) => right.calories - left.calories);

  const fittingMeals = sortedMeals.filter((meal) => meal.calories <= calorieRoom);
  const fallbackMeals = sortedMeals.slice(-3).reverse();

  return (fittingMeals.length > 0 ? fittingMeals : fallbackMeals).slice(0, 3);
}

function getBestCatalogMatch(query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return null;
  }

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const allFoods = mealCatalog.flatMap((group) => group.items);

  const ranked = allFoods
    .map((item) => {
      const haystack = normalizeText(`${item.name} ${item.default_portion} ${item.category}`);
      const nameTokens = normalizeText(item.name).split(' ').filter(Boolean);

      const directMatch = haystack === normalizedQuery ? 50 : 0;
      const prefixMatch = haystack.startsWith(normalizedQuery) ? 20 : 0;
      const tokenMatch = queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 8 : 0), 0);
      const nameMatch = nameTokens.reduce((score, token) => score + (normalizedQuery.includes(token) ? 10 : 0), 0);
      const fuzzyMatch = nameTokens.some((token) => isLooseTextMatch(normalizedQuery, token)) ? 12 : 0;

      return {
        item,
        score: directMatch + prefixMatch + tokenMatch + nameMatch + fuzzyMatch,
      };
    })
    .filter((candidate) => candidate.score >= 12)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item ?? null;
}

function getQuantityFromText(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return 1;
  }

  if (/\bone and a half\b|\bone and half\b/.test(normalized)) {
    return 1.5;
  }

  if (/\bhalf\b/.test(normalized)) {
    return 0.5;
  }

  if (/\bquarter\b/.test(normalized)) {
    return 0.25;
  }

  if (/\btriple\b/.test(normalized)) {
    return 3;
  }

  if (/\bdouble\b/.test(normalized)) {
    return 2;
  }

  const prefixQuantityMatch = normalized.match(/^((?:\d+(?:\.\d+)?)|(?:one(?:\s+and\s+a\s+half)?))\s*(?:x|times)?\b/);

  if (prefixQuantityMatch) {
    const value = prefixQuantityMatch[1];

    if (value === 'one' || value.startsWith('one and a half')) {
      return value.includes('half') ? 1.5 : 1;
    }

    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const embeddedQuantityMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:packet|packets|piece|pieces|cup|cups|bowl|bowls|slice|slices|egg|eggs|roti|rotis|serving|servings|scoop|scoops)\b/);

  if (embeddedQuantityMatch) {
    const parsed = Number(embeddedQuantityMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 1;
}

function inferFromAlias(text: string) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return null;
  }

  const aliasCatalog = [
    { terms: ['maggi', 'instant noodles', 'noodles'], label: 'Maggi / noodles', calories: 350 },
    { terms: ['sandwich', 'bread sandwich'], label: 'Sandwich', calories: 250 },
    { terms: ['banana'], label: 'Banana', calories: 105 },
    { terms: ['milk'], label: 'Milk', calories: 150 },
    { terms: ['fries', 'french fries'], label: 'Fries', calories: 300 },
    { terms: ['burger'], label: 'Burger', calories: 350 },
    { terms: ['omelette'], label: 'Omelette', calories: 180 },
  ];

  const matched = aliasCatalog.find((entry) =>
    entry.terms.some((term) => normalized.includes(normalizeText(term)) || isLooseTextMatch(normalized, normalizeText(term))),
  );

  if (!matched) {
    return null;
  }

  const quantity = getQuantityFromText(text);

  return {
    itemName: matched.label,
    calories: Math.round(matched.calories * quantity),
  };
}

function canScaleCatalogItem(item: (typeof mealCatalog)[number]['items'][number]) {
  const portion = normalizeText(item.default_portion);
  return /\b(egg|eggs|slice|slices|piece|pieces|cup|cups|scoop|scoops|roti|rotis|packet|packets)\b/.test(portion);
}

function getCatalogBaseQuantity(item: (typeof mealCatalog)[number]['items'][number]) {
  const portion = normalizeText(item.default_portion);
  const countMatch = portion.match(/(\d+(?:\.\d+)?)/);

  if (!countMatch) {
    return 1;
  }

  const parsed = Number(countMatch[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getMealScore(item: (typeof mealCatalog)[number]['items'][number], calorieRoom: number) {
  const text = `${item.name} ${item.default_portion} ${item.category}`.toLowerCase();
  const proteinSignals = ['protein', 'egg', 'chicken', 'soya', 'dal', 'yogurt'];
  const lightSignals = ['apple', 'coffee', 'tea', 'veg', 'salad'];

  let score = 0;

  if (item.calories <= calorieRoom) {
    score += 30;
  }

  if (item.calories <= Math.max(250, calorieRoom * 0.35)) {
    score += 10;
  }

  if (proteinSignals.some((signal) => text.includes(signal))) {
    score += 20;
  }

  if (lightSignals.some((signal) => text.includes(signal))) {
    score += 8;
  }

  return score + Math.min(item.calories / 10, 25);
}

function getCatalogSuggestions(query: string) {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return [];
  }

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const allFoods = mealCatalog.flatMap((group) => group.items);

  return allFoods
    .map((item) => {
      const haystack = normalizeText(`${item.name} ${item.default_portion} ${item.category}`);
      const exactMatch = haystack === normalizedQuery ? 40 : 0;
      const prefixMatch = haystack.startsWith(normalizedQuery) ? 20 : 0;
      const tokenMatch = queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 10 : 0), 0);
      const calorieSignal = item.calories < 100 ? 3 : item.calories < 250 ? 7 : 10;

      return {
        item,
        score: exactMatch + prefixMatch + tokenMatch + calorieSignal,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((candidate) => candidate.item);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isLooseTextMatch(query: string, term: string) {
  if (!query || !term) {
    return false;
  }

  if (query === term || query.includes(term) || term.includes(query)) {
    return true;
  }

  if (query.length !== term.length) {
    return false;
  }

  const mismatches: number[] = [];

  for (let index = 0; index < query.length; index += 1) {
    if (query[index] !== term[index]) {
      mismatches.push(index);

      if (mismatches.length > 2) {
        return false;
      }
    }
  }

  if (mismatches.length === 1) {
    return true;
  }

  if (mismatches.length !== 2) {
    return false;
  }

  const [firstMismatch, secondMismatch] = mismatches;
  return (
    firstMismatch + 1 === secondMismatch &&
    query[firstMismatch] === term[secondMismatch] &&
    query[secondMismatch] === term[firstMismatch]
  );
}

function extractPlainTextEntry(rawText: string, fallbackCaloriesText: string) {
  const cleanedText = rawText.trim();

  if (!cleanedText) {
    return { error: 'Type a food name first.' };
  }

  const trailingCaloriesMatch = cleanedText.match(/^(.*?)(?:\s*(?:-|:|=)\s*)(\d+(?:\.\d+)?)\s*(?:kcal|cal)?$/i);
  const inlineCaloriesMatch = cleanedText.match(/^(.*?)(\d+(?:\.\d+)?)\s*(?:kcal|cal)?$/i);

  let itemName = cleanedText;
  let caloriesText = fallbackCaloriesText.trim();

  if (trailingCaloriesMatch) {
    itemName = trailingCaloriesMatch[1].trim();
    caloriesText = trailingCaloriesMatch[2];
  } else if (inlineCaloriesMatch && fallbackCaloriesText.trim()) {
    itemName = inlineCaloriesMatch[1].trim();
  }

  const normalizedName = normalizeText(itemName);
  const matchedFood = mealCatalogByName[itemName] ?? getBestCatalogMatch(itemName);
  const aliasMatch = inferFromAlias(itemName);

  if (aliasMatch && !caloriesText) {
    return aliasMatch;
  }

  const parsedCalories = Number(caloriesText || (matchedFood ? String(matchedFood.calories) : ''));
  const isExactCatalogMatch = matchedFood ? normalizeText(matchedFood.name) === normalizedName : false;

  if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
    if (matchedFood) {
      const quantity = getQuantityFromText(itemName);

      if (quantity !== 1 && canScaleCatalogItem(matchedFood)) {
        const baseQuantity = getCatalogBaseQuantity(matchedFood);

        return {
          itemName: matchedFood.name,
          calories: Math.max(1, Math.round((matchedFood.calories / baseQuantity) * quantity)),
        };
      }

      return {
        itemName: matchedFood.name,
        calories: matchedFood.calories,
      };
    }

    if (aliasMatch) {
      return aliasMatch;
    }

    return { error: 'Add calories like "maggi 350" or pick one of the fixed cards.' };
  }

  return {
    itemName: aliasMatch?.itemName ?? (isExactCatalogMatch ? matchedFood?.name ?? itemName : itemName),
    calories: Math.round(parsedCalories),
  };
}

  function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(timestamp));
}

function createFoodLog(foodName: string, timestamp: string): DailyLogEntry | null {
  const food = mealCatalogByName[foodName];

  if (!food) {
    return null;
  }

  return {
    id: Date.now(),
    food_id: food.id,
    custom_name: null,
    custom_calories: null,
    timestamp,
    food,
  };
}

function createCustomLog(customName: string, calories: number, timestamp: string): DailyLogEntry {
  return {
    id: Date.now(),
    food_id: null,
    custom_name: customName,
    custom_calories: calories,
    timestamp,
    food: null,
  };
}

export function CalorieDashboard({ initialLogs, canPersist }: CalorieDashboardProps) {
  const [logs, setLogs] = useState<DailyLogEntry[]>(initialLogs);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey(new Date()));
  const [followToday, setFollowToday] = useState(true);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [plainTextItem, setPlainTextItem] = useState('');
  const [plainTextCalories, setPlainTextCalories] = useState('');
  const [selectedBucket, setSelectedBucket] = useState<TimeOfDayKey>(getAutoTimeOfDay());
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<LogDraft | null>(null);

  useEffect(() => {
    if (!followToday) {
      return;
    }

    let timeoutId = window.setTimeout(function tick() {
      setSelectedDate(getLocalDateKey(new Date()));

      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 25);

      timeoutId = window.setTimeout(tick, nextMidnight.getTime() - now.getTime());
    }, (() => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 25);
      return nextMidnight.getTime() - now.getTime();
    })());

    return () => window.clearTimeout(timeoutId);
  }, [followToday]);

  const todayKey = getLocalDateKey(new Date());
  const selectedDayLogs = useMemo(
    () =>
      [...logs]
        .filter((log) => getLocalDateKey(new Date(log.timestamp)) === selectedDate)
        .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
    [logs, selectedDate],
  );

  useEffect(() => {
    if (editingLogId === null) {
      return;
    }

    if (!selectedDayLogs.some((log) => log.id === editingLogId)) {
      setEditingLogId(null);
      setEditDraft(null);
    }
  }, [editingLogId, selectedDayLogs]);

  const totalCalories = useMemo(
    () =>
      selectedDayLogs.reduce((sum, log) => {
        if (log.food) {
          return sum + log.food.calories;
        }

        return sum + (log.custom_calories ?? 0);
      }, 0),
    [selectedDayLogs],
  );
  const totalMacros = useMemo(
    () =>
      selectedDayLogs.reduce(
        (totals, log) => {
          if (log.food) {
            totals.protein += log.food.protein_g;
            totals.carbs += log.food.carbs_g;
            totals.fat += log.food.fat_g;
          }

          return totals;
        },
        { protein: 0, carbs: 0, fat: 0 },
      ),
    [selectedDayLogs],
  );

  const progress = Math.min((totalCalories / dailyCalorieTarget.maximum) * 100, 100);
  const inRange = totalCalories >= dailyCalorieTarget.minimum && totalCalories <= dailyCalorieTarget.maximum;
  const isOver = totalCalories > dailyCalorieTarget.maximum;
  const remainingToFloor = Math.max(dailyCalorieTarget.minimum - totalCalories, 0);
  const remainingToCeiling = Math.max(dailyCalorieTarget.maximum - totalCalories, 0);
  const syncLabel = canPersist ? '' : 'Local preview mode';
  const activeBucket = getTimeOfDayBucket(selectedBucket);
  const activeMeals = mealCatalog.flatMap((group) => group.items).filter((item) => getItemNamesForBucket(activeBucket).includes(item.name));
  const recommendedMeals = [...getRecommendedMeals(activeMeals, remainingToCeiling)]
    .sort((left, right) => getMealScore(right, remainingToCeiling) - getMealScore(left, remainingToCeiling));
  const parsedPlainText = extractPlainTextEntry(plainTextItem, plainTextCalories);
  const catalogSuggestions = getCatalogSuggestions(plainTextItem);
  const parsedRecommendation = 'error' in parsedPlainText ? null : parsedPlainText;

  function setDateSelection(dateKey: string, shouldFollowToday = dateKey === todayKey) {
    setSelectedDate(dateKey);
    setFollowToday(shouldFollowToday);
    setEditingLogId(null);
    setEditDraft(null);
  }

  function beginEdit(log: DailyLogEntry) {
    setEditingLogId(log.id);
    setEditDraft({
      label: getFoodName(log),
      calories: String(log.food?.calories ?? log.custom_calories ?? 0),
      timestamp: formatDateTimeInputValue(log.timestamp),
    });
    setNotice(null);
  }

  function cancelEdit() {
    setEditingLogId(null);
    setEditDraft(null);
  }

  async function saveEditedLog(logId: number) {
    if (!editDraft) {
      return;
    }

    const trimmedLabel = editDraft.label.trim();
    const parsedCalories = Number(editDraft.calories);
    const parsedTimestamp = new Date(editDraft.timestamp);

    if (!trimmedLabel) {
      setNotice('Add a food name before saving the edit.');
      return;
    }

    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
      setNotice('Calories must be a positive number.');
      return;
    }

    if (Number.isNaN(parsedTimestamp.getTime())) {
      setNotice('Pick a valid date and time for the log.');
      return;
    }

    setPendingLabel(`edit-${logId}`);
    setNotice(null);

    if (!canPersist) {
      setLogs((current) =>
        current.map((log) =>
          log.id === logId
            ? {
                ...log,
                food_id: null,
                food: null,
                custom_name: trimmedLabel,
                custom_calories: Math.round(parsedCalories),
                timestamp: parsedTimestamp.toISOString(),
              }
            : log,
        ),
      );
      cancelEdit();
      setNotice('Log updated locally. Add Supabase env vars to sync it.');
      setPendingLabel(null);
      return;
    }

    const result = await updateLog(logId, trimmedLabel, parsedCalories, parsedTimestamp.toISOString());

    if (result.ok) {
      setLogs((current) =>
        current
          .map((log) => (log.id === logId ? result.data : log))
          .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()),
      );
      cancelEdit();
      setNotice('Log updated.');
    } else {
      setNotice(result.error);
    }

    setPendingLabel(null);
  }

  async function handleQuickAdd(foodName: string) {
    const timestamp = buildTimestampForSelectedDate(selectedDate);

    if (!canPersist) {
      const optimistic = createFoodLog(foodName, timestamp);

      if (optimistic) {
        setLogs((current) => [optimistic, ...current]);
        setNotice(`${foodName} saved locally. Add Supabase env vars to sync it.`);
      } else {
        setNotice('That food is not available in the catalog.');
      }

      return;
    }

    setPendingLabel(foodName);
    setNotice(null);

    const result = await addFoodLog(foodName, timestamp);

    if (result.ok) {
      setLogs((current) => [result.data, ...current]);
      setNotice(`${foodName} added.`);
    } else {
      setNotice(result.error);
    }

    setPendingLabel(null);
  }

  async function handleDelete(logId: number) {
    const existing = logs.find((log) => log.id === logId);

    if (!existing) {
      return;
    }

    if (!canPersist) {
      setLogs((current) => current.filter((log) => log.id !== logId));
      if (editingLogId === logId) {
        cancelEdit();
      }
      setNotice(`${getFoodName(existing)} removed.`);
      return;
    }

    setPendingLabel(`delete-${logId}`);
    setNotice(null);

    const result = await deleteLog(logId);

    if (result.ok) {
      setLogs((current) => current.filter((log) => log.id !== logId));
      if (editingLogId === logId) {
        cancelEdit();
      }
      setNotice(`${getFoodName(existing)} removed.`);
    } else {
      setNotice(result.error);
    }

    setPendingLabel(null);
  }

  async function handleCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = extractPlainTextEntry(plainTextItem, plainTextCalories);

    await saveParsedCustomLog(parsed);
  }

  async function saveParsedCustomLog(parsed: ReturnType<typeof extractPlainTextEntry>) {
    if ('error' in parsed) {
      setNotice(parsed.error);
      return;
    }

    if (pendingLabel === 'custom') {
      return;
    }

    if (!canPersist) {
      setLogs((current) => [createCustomLog(parsed.itemName, parsed.calories, buildTimestampForSelectedDate(selectedDate)), ...current]);
      setPlainTextItem('');
      setPlainTextCalories('');
      setNotice('One-off item saved locally. Add Supabase env vars to sync it.');
      return;
    }

    setPendingLabel('custom');
    setNotice(null);

    const result = await addCustomLog(parsed.itemName, parsed.calories, buildTimestampForSelectedDate(selectedDate));

    if (result.ok) {
      setLogs((current) => [result.data, ...current]);
      setPlainTextItem('');
      setPlainTextCalories('');
      setNotice(`${parsed.itemName} saved as a one-off item.`);
    } else {
      setNotice(result.error);
    }

    setPendingLabel(null);
  }

  const selectedDayLabel = selectedDate === todayKey ? "Today's log" : `${formatDateKeyLabel(selectedDate)} log`;

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col gap-5">
      <header className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium tracking-[0.2em] text-cyan-100 uppercase">
                Daily calorie tracker
              </div>
              {syncLabel ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-medium text-slate-300">
                  {syncLabel}
                </div>
              ) : null}
            </div>
              <div className="space-y-2">
              </div>
          </div>

          <div className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between text-sm text-slate-400">
              <span>Current total</span>
              <span>{formatCalories(totalCalories)} kcal</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800/80">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isOver ? 'bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300' : inRange ? 'bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400' : 'bg-gradient-to-r from-slate-400 via-sky-400 to-cyan-300'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {inRange ? 'In range' : isOver ? 'Over target' : 'Below target'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {remainingToFloor > 0 ? `${formatCalories(remainingToFloor)} to floor` : 'Floor cleared'}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {remainingToCeiling > 0 ? `${formatCalories(remainingToCeiling)} left to ceiling` : 'Ceiling reached'}
              </span>
            </div>
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Macros</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm sm:text-base">
                <div>
                  <div className="text-slate-400">Protein</div>
                  <div className="font-semibold text-white">{formatMacro(totalMacros.protein)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Carbs</div>
                  <div className="font-semibold text-white">{formatMacro(totalMacros.carbs)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Fat</div>
                  <div className="font-semibold text-white">{formatMacro(totalMacros.fat)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {notice ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-slate-200">
            {notice}
          </div>
        ) : null}
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-white">Choose time of day</h2>
              </div>
                <div className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                Auto: {getTimeOfDayBucket(getAutoTimeOfDay()).label}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {timeOfDayBuckets.map((bucket) => {
                const isActive = selectedBucket === bucket.key;

                return (
                  <button
                    key={bucket.key}
                    type="button"
                    onClick={() => setSelectedBucket(bucket.key)}
                    className={`rounded-3xl border px-4 py-4 text-left transition ${
                      isActive
                        ? 'border-cyan-300/40 bg-cyan-400/15 text-white shadow-lg shadow-cyan-400/10'
                        : 'border-white/10 bg-slate-950/60 text-slate-300 hover:border-cyan-400/30 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{bucket.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{bucket.helper}</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                        {bucket.hours[0]}-{bucket.hours[1]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-white">Recommended next</h2>
              </div>
              <div className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                {remainingToCeiling > 0 ? `${formatCalories(remainingToCeiling)} left` : 'Budget met'}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {parsedRecommendation ? (
                <button
                  type="button"
                  onClick={async () => {
                    await saveParsedCustomLog(parsedRecommendation);
                  }}
                  disabled={Boolean(pendingLabel)}
                  className="rounded-3xl border border-emerald-300/40 bg-emerald-400/15 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-100/80">Parsed match</div>
                      <div className="mt-1 font-medium text-white">{parsedRecommendation.itemName}</div>
                      <div className="mt-1 text-xs leading-5 text-emerald-50/80">Tap to log this one-off item now.</div>
                    </div>
                    <div className="shrink-0 rounded-full border border-emerald-200/30 bg-emerald-300/15 px-2.5 py-1 text-xs font-semibold text-emerald-50">
                      {formatCalories(parsedRecommendation.calories)}
                    </div>
                  </div>
                </button>
              ) : null}

              {recommendedMeals.map((item, index) => {
                const isTopPick = index === 0;

                return (
                  <button
                    key={`${item.name}-recommended`}
                    type="button"
                    onClick={() => handleQuickAdd(item.name)}
                    disabled={Boolean(pendingLabel)}
                    className={`rounded-3xl border px-4 py-4 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isTopPick
                        ? 'border-cyan-300/40 bg-cyan-400/15 shadow-lg shadow-cyan-400/10'
                        : 'border-white/10 bg-slate-950/60 hover:border-cyan-400/30 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
                          {isTopPick ? 'Top pick' : 'Also fits'}
                        </div>
                        <div className="mt-1 font-medium text-white">{item.name}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">{item.default_portion}</div>
                      </div>
                      <div className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                        {formatCalories(item.calories)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-white">{activeBucket.label} quick-add</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                {activeMeals.length} options
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeMeals.map((item) => {
                const isActive = pendingLabel === item.name;

                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => handleQuickAdd(item.name)}
                    disabled={Boolean(pendingLabel) && !isActive}
                    className="group flex min-h-[98px] flex-col justify-between rounded-3xl border border-white/10 bg-slate-950/70 p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400/35 hover:bg-slate-900/95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white transition group-hover:text-cyan-100">{item.name}</div>
                        <div className="mt-1 text-xs leading-5 text-slate-400">{item.default_portion}</div>
                      </div>
                      <div className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                        {formatCalories(item.calories)}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                      <span>{item.category}</span>
                      <span>{isActive ? 'Adding...' : 'Tap to add'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5">
            <div className="mb-4">
              <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-white">One-off item</h2>
            </div>

            {!('error' in parsedPlainText) ? (
              <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
                <div className="text-xs uppercase tracking-[0.18em] text-emerald-100/80">Parsed preview</div>
                <div className="mt-1 font-medium">{parsedPlainText.itemName}</div>
                <div className="mt-1 text-emerald-100/90">{formatCalories(parsedPlainText.calories)} kcal</div>
                <button
                  type="button"
                  onClick={() => saveParsedCustomLog(parsedPlainText)}
                  disabled={Boolean(pendingLabel)}
                  className="mt-3 inline-flex items-center justify-center rounded-full border border-emerald-200/30 bg-emerald-300/15 px-3 py-1.5 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-300/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingLabel === 'custom' ? 'Adding item...' : 'Add now'}
                </button>
              </div>
            ) : plainTextItem.trim() ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                {parsedPlainText.error}
              </div>
            ) : null}

            <form onSubmit={handleCustomSubmit} className="space-y-3">
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Item text</span>
                <input
                  value={plainTextItem}
                  onChange={(event) => setPlainTextItem(event.target.value)}
                  placeholder="e.g. maggi 350 or 2 eggs 210"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>

              {catalogSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Suggestions</div>
                  <div className="grid gap-2">
                    {catalogSuggestions.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          setPlainTextItem(item.name);
                          setPlainTextCalories(String(item.calories));
                          setNotice(`Matched ${item.name}. You can edit calories before saving.`);
                        }}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left transition hover:border-cyan-400/35 hover:bg-white/5"
                      >
                        <div>
                          <div className="font-medium text-white">{item.name}</div>
                          <div className="text-xs text-slate-400">{item.default_portion}</div>
                        </div>
                        <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                          {formatCalories(item.calories)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Calories, if not in text</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={plainTextCalories}
                  onChange={(event) => setPlainTextCalories(event.target.value)}
                  placeholder="320"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                />
              </label>

              <button
                type="submit"
                disabled={pendingLabel === 'custom'}
                className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {pendingLabel === 'custom' ? 'Adding item...' : 'Add off-menu item'}
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-soft backdrop-blur-xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-space-grotesk)] text-xl font-semibold text-white">Day log</h2>
                <p className="mt-1 text-sm text-slate-400">View, add, or edit entries for any stored date.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setDateSelection(event.target.value || todayKey, event.target.value === todayKey)}
                  className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                />
                <button
                  type="button"
                  onClick={() => setDateSelection(todayKey, true)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300 transition hover:border-cyan-400/30 hover:bg-white/10 hover:text-white"
                >
                  Today
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">{selectedDayLabel}</span>
              <span className="w-fit">{selectedDayLogs.length} entries</span>
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="min-w-0 font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-white">
                {selectedDate === todayKey ? 'Today' : formatDateKeyLabel(selectedDate)} summary
              </h3>
              <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                {selectedDayLogs.length} entries
              </span>
            </div>

            {selectedDayLogs.length > 0 ? (
              <div className="space-y-2">
                {selectedDayLogs.map((log) => {
                  const label = getFoodName(log);
                  const calories = log.food?.calories ?? log.custom_calories ?? 0;
                  const isEditing = editingLogId === log.id;

                  return (
                    <article key={log.id} className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
                      {isEditing && editDraft ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="block space-y-2 md:col-span-2">
                              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Food name</span>
                              <input
                                value={editDraft.label}
                                onChange={(event) => setEditDraft((current) => (current ? { ...current, label: event.target.value } : current))}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                              />
                            </label>

                            <label className="block space-y-2">
                              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Calories</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={editDraft.calories}
                                onChange={(event) => setEditDraft((current) => (current ? { ...current, calories: event.target.value } : current))}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                              />
                            </label>

                            <label className="block space-y-2">
                              <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Date and time</span>
                              <input
                                type="datetime-local"
                                value={editDraft.timestamp}
                                onChange={(event) => setEditDraft((current) => (current ? { ...current, timestamp: event.target.value } : current))}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
                              />
                            </label>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">Exact catalog matches stay catalog-backed; any other edit becomes a custom entry.</div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEditedLog(log.id)}
                                disabled={pendingLabel === `edit-${log.id}`}
                                className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {pendingLabel === `edit-${log.id}` ? 'Saving...' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white">{label}</div>
                            <div className="mt-1 text-sm text-slate-400">{log.food?.default_portion ?? 'Manual calorie entry'}</div>
                            <div className="mt-2 text-xs text-slate-500">{formatTime(log.timestamp)}</div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm font-semibold text-cyan-100">
                              {formatCalories(calories)} kcal
                            </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => beginEdit(log)}
                                disabled={Boolean(pendingLabel)}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(log.id)}
                                disabled={pendingLabel === `delete-${log.id}`}
                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {pendingLabel === `delete-${log.id}` ? 'Removing...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/60 px-4 py-10 text-center text-sm text-slate-400">
                No entries yet for this date. Add one from the quick-add cards or switch to another day.
              </div>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}