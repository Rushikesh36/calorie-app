import type { FoodCategory, FoodItem } from '@/lib/types';

export const dailyCalorieTarget = {
  minimum: 1800,
  maximum: 2100,
};

export const mealCatalog: FoodCategory[] = [
  {
    name: 'Morning / Breakfast / Pre-Workout',
    description: 'Fast, high-compliance morning rotation for clean tapping.',
    items: [
      {
        id: 1,
        name: 'High-Protein Overnight Oats',
        calories: 380,
        default_portion: '50g oats, 200ml milk, 1 scoop protein, 100g Greek yogurt',
        category: 'Morning / Breakfast / Pre-Workout',
      },
      {
        id: 2,
        name: 'Morning Tea',
        calories: 70,
        default_portion: 'With Stevia / zero-cal sweetener and 200ml milk',
        category: 'Morning / Breakfast / Pre-Workout',
      },
      {
        id: 3,
        name: 'Parle-G Biscuits',
        calories: 120,
        default_portion: '5 biscuits',
        category: 'Morning / Breakfast / Pre-Workout',
      },
      {
        id: 4,
        name: 'Boiled Eggs',
        calories: 210,
        default_portion: '3 eggs',
        category: 'Morning / Breakfast / Pre-Workout',
      },
      {
        id: 5,
        name: 'Apple',
        calories: 95,
        default_portion: '1 medium',
        category: 'Morning / Breakfast / Pre-Workout',
      },
      {
        id: 6,
        name: 'Caffè Nero Coffee',
        calories: 10,
        default_portion: 'Black or zero-cal',
        category: 'Morning / Breakfast / Pre-Workout',
      },
    ],
  },
  {
    name: 'Lunch (Fixed Daily Tiffin)',
    description: 'Your structured midday stack, tuned for consistency.',
    items: [
      {
        id: 7,
        name: 'Vegetable Soya Pulao',
        calories: 430,
        default_portion: 'Volumized with mixed veggies and soya chunks',
        category: 'Lunch (Fixed Daily Tiffin)',
      },
      {
        id: 8,
        name: 'Chobani Yogurt',
        calories: 100,
        default_portion: '1 cup',
        category: 'Lunch (Fixed Daily Tiffin)',
      },
      {
        id: 9,
        name: 'Homemade Dry Fruit Barfi',
        calories: 170,
        default_portion: '2 pieces',
        category: 'Lunch (Fixed Daily Tiffin)',
      },
      {
        id: 10,
        name: 'Protein Shake',
        calories: 130,
        default_portion: '1 scoop',
        category: 'Lunch (Fixed Daily Tiffin)',
      },
    ],
  },
  {
    name: 'Dinner (Varied High-Protein Rotation)',
    description: 'Dinner blocks are modular so you can assemble the plate quickly.',
    items: [
      {
        id: 11,
        name: 'Air-Fried Chicken Breast',
        calories: 330,
        default_portion: '200g raw / 7oz',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 12,
        name: 'Cooked White Rice',
        calories: 100,
        default_portion: '75g',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 13,
        name: 'Cooked White Rice (veg portion)',
        calories: 130,
        default_portion: '100g',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 14,
        name: 'Cooked Dal',
        calories: 100,
        default_portion: '100g',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 15,
        name: 'Cooked Dal (veg portion)',
        calories: 200,
        default_portion: '200g',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 16,
        name: 'Whole Wheat Roti',
        calories: 90,
        default_portion: '1 piece',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 17,
        name: 'Soya Chunks',
        calories: 170,
        default_portion: '50g dry, boiled',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 18,
        name: 'Whole Egg Bhurji',
        calories: 330,
        default_portion: '4 eggs cooked',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 19,
        name: 'Whole Wheat Bread',
        calories: 240,
        default_portion: '3 slices',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
      {
        id: 20,
        name: 'Air-Fried Mixed Veggies',
        calories: 50,
        default_portion: 'Massive portion',
        category: 'Dinner (Varied High-Protein Rotation)',
      },
    ],
  },
];

export const mealCatalogByName = mealCatalog.flatMap((group) => group.items).reduce<Record<string, FoodItem>>((lookup, item) => {
  lookup[item.name] = item;
  return lookup;
}, {} as Record<string, FoodItem>);