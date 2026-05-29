export type FoodItem = {
  id: number;
  name: string;
  calories: number;
  default_portion: string;
  category: string;
};

export type FoodCategory = {
  name: string;
  description: string;
  items: FoodItem[];
};

export type DailyLogEntry = {
  id: number;
  food_id: number | null;
  custom_name: string | null;
  custom_calories: number | null;
  timestamp: string;
  food: FoodItem | null;
};

export type ActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };