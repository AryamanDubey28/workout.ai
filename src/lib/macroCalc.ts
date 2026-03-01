import { Macros } from '@/types/meal';

export type TouchedFields = {
  calories: boolean;
  protein: boolean;
  carbs: boolean;
  fat: boolean;
};

const CAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;
const TOLERANCE = 0.10;

/**
 * If exactly 3 of 4 macro fields are touched, calculates the missing one.
 * Returns the updated macros and which field was auto-filled (or null).
 */
export function autoCalculateMacro(
  macros: Macros,
  touched: TouchedFields
): { macros: Macros; autoFilledField: keyof Macros | null } {
  const touchedKeys = (Object.keys(touched) as (keyof Macros)[]).filter((k) => touched[k]);
  if (touchedKeys.length !== 3) {
    return { macros, autoFilledField: null };
  }

  const untouchedKey = (Object.keys(touched) as (keyof Macros)[]).find((k) => !touched[k]);
  if (!untouchedKey) return { macros, autoFilledField: null };

  const result = { ...macros };

  if (untouchedKey === 'calories') {
    result.calories = Math.round(
      macros.protein * CAL_PER_GRAM.protein +
        macros.carbs * CAL_PER_GRAM.carbs +
        macros.fat * CAL_PER_GRAM.fat
    );
  } else if (touched.calories) {
    const knownCalories =
      (untouchedKey !== 'protein' ? macros.protein * CAL_PER_GRAM.protein : 0) +
      (untouchedKey !== 'carbs' ? macros.carbs * CAL_PER_GRAM.carbs : 0) +
      (untouchedKey !== 'fat' ? macros.fat * CAL_PER_GRAM.fat : 0);

    const remainingCalories = macros.calories - knownCalories;
    if (remainingCalories < 0) {
      return { macros, autoFilledField: null };
    }

    const divisor = CAL_PER_GRAM[untouchedKey as 'protein' | 'carbs' | 'fat'];
    result[untouchedKey] = Math.round(remainingCalories / divisor);
  } else {
    return { macros, autoFilledField: null };
  }

  return { macros: result, autoFilledField: untouchedKey };
}

/**
 * When all 4 fields are filled, checks if P*4 + C*4 + F*9 is within 10% of stated calories.
 * Returns a warning message or null.
 */
export function validateMacroConsistency(macros: Macros): string | null {
  const computed =
    macros.protein * CAL_PER_GRAM.protein +
    macros.carbs * CAL_PER_GRAM.carbs +
    macros.fat * CAL_PER_GRAM.fat;

  if (macros.calories === 0 && computed === 0) return null;
  if (macros.calories === 0) {
    return `Macros add up to ~${Math.round(computed)} cal but calories is 0`;
  }

  const ratio = Math.abs(computed - macros.calories) / macros.calories;
  if (ratio > TOLERANCE) {
    const diff = Math.round(computed - macros.calories);
    const direction = diff > 0 ? 'more' : 'fewer';
    return `Macros add up to ~${Math.round(computed)} cal (${Math.abs(diff)} ${direction} than entered)`;
  }

  return null;
}
