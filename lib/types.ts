export type FoodStatus = "pending" | "resolved";

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unit: string;
}

export interface DailyLog {
  id: string;
  logged_at: string;       // ISO timestamp
  meal_slot: string | null;
  raw_input: string;
  quantity: string | null;
  display_name: string;
  food_id: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  status: FoodStatus;
}

export interface DailyInsight {
  date: string;
  best_choice: string | null;
  skip_suggestion: string | null;
  intake_assessment: string | null;  // "too little" | "optimal" | "too much"
  total_calories: number | null;
  total_protein: number | null;
  total_carbs: number | null;
  total_fat: number | null;
  gemini_summary: string | null;
  synced_at: string;
}

export interface WeightLog {
  id: string;
  measured_at: string;
  weight_kg: number;
  note: string | null;
}

export interface TopPick {
  display_name: string;
  raw_input: string;
  count: number;
}
