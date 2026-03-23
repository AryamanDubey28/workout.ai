import {
  initDatabase,
  getUserPresets,
  getWorkoutHistoryForContext,
  getProgressionParams,
  upsertExerciseRecommendation,
  getDailyHealthMetrics,
  getUserMealsByDate,
  getMacroGoal,
  ExerciseHistoryEntry,
  ProgressionParams,
} from '@/lib/db';
import { Exercise, Workout } from '@/types/workout';

// --- Types ---

export interface Recommendation {
  recommendedWeight: string | null;
  recommendedReps: number | null;
  recommendationType: 'increase_weight' | 'increase_reps' | 'deload' | 'maintain' | 'add_weight_to_bw';
  recommendationText: string | null;
  confidence: 'low' | 'medium' | 'high';
  stallCount: number;
  basedOnSessions: number;
  reasoning: string;
  altWeight: string | null;
  altReps: number | null;
  altText: string | null;
  healthAdvisory: string | null;
}

// --- Helpers ---

function parseWeight(w: string | undefined): number | null {
  if (!w || w === 'BW') return null;
  const n = parseFloat(w);
  return isNaN(n) ? null : n;
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeIncrement(currentWeight: number, params: ProgressionParams): number {
  // Prefer AI-tuned absolute increment if available
  if (params.weightIncrement != null) {
    return clamp(params.weightIncrement, params.minIncrement, params.maxIncrement);
  }
  // Percentage-based default
  const pctIncrement = currentWeight * (params.weightIncrementPct ?? 5) / 100;
  return clamp(roundToNearest(pctIncrement, 2.5), params.minIncrement, params.maxIncrement);
}

function getRepsPerSet(entry: ExerciseHistoryEntry): number[] {
  if (entry.repsPerSet && entry.repsPerSet.length > 0) {
    return entry.repsPerSet;
  }
  return Array(entry.sets || 3).fill(entry.reps || 0);
}

function weightLabel(w: string | null): string {
  if (!w || w === 'BW') return 'BW';
  return `${w}kg`;
}

// Compute whether a session showed improvement over the previous one
function sessionImproved(current: ExerciseHistoryEntry, previous: ExerciseHistoryEntry): boolean {
  const curWeight = parseWeight(current.weight);
  const prevWeight = parseWeight(previous.weight);

  // Weight increased
  if (curWeight != null && prevWeight != null && curWeight > prevWeight) return true;

  // Same weight (or BW), check reps
  const curReps = getRepsPerSet(current);
  const prevReps = getRepsPerSet(previous);
  const curTotal = curReps.reduce((a, b) => a + b, 0);
  const prevTotal = prevReps.reduce((a, b) => a + b, 0);

  if (curTotal > prevTotal) return true;

  // Same total reps but more sets
  if (curReps.length > prevReps.length && curTotal >= prevTotal) return true;

  return false;
}

// --- Core Algorithm ---

export function computeRecommendation(
  history: ExerciseHistoryEntry[],
  params: ProgressionParams,
  presetExercise: Exercise
): Recommendation {
  const basedOnSessions = history.length;
  const empty: Recommendation = {
    recommendedWeight: null,
    recommendedReps: null,
    recommendationType: 'maintain',
    recommendationText: null,
    confidence: 'low',
    stallCount: 0,
    basedOnSessions: 0,
    reasoning: 'Not enough data yet — keep logging workouts',
    altWeight: null,
    altReps: null,
    altText: null,
    healthAdvisory: null,
  };

  // No history → no recommendation
  if (history.length === 0) return empty;

  const lastSession = history[0];
  const lastWeight = parseWeight(lastSession.weight);
  const lastWeightStr = lastSession.weight || 'BW';
  const lastRepsPerSet = getRepsPerSet(lastSession);

  const repMin = presetExercise.repRangeMin ?? 8;
  const repMax = presetExercise.repRangeMax ?? 12;

  // Determine if all sessions logged BW
  const allBW = history.every(h => h.weight === 'BW');
  const hasUsedAddedWeight = history.some(h => h.weight !== 'BW' && parseWeight(h.weight) != null && parseWeight(h.weight)! > 0);

  // Check if all sets hit top of range
  const allSetsAtTop = lastRepsPerSet.every(r => r >= repMax);

  // Compute stall count: consecutive sessions without improvement
  let stallCount = 0;
  for (let i = 0; i < Math.min(history.length - 1, params.stallThreshold + 1); i++) {
    if (!sessionImproved(history[i], history[i + 1])) {
      stallCount++;
    } else {
      break;
    }
  }

  // --- Deload: weighted exercise stalled ---
  if (stallCount >= params.stallThreshold && lastWeight != null) {
    const deloadWeight = roundToNearest(lastWeight * (1 - params.deloadPct / 100), 2.5);
    return {
      recommendedWeight: String(deloadWeight),
      recommendedReps: repMin,
      recommendationType: 'deload',
      recommendationText: `Deload → ${repMin} reps @ ${deloadWeight}kg`,
      confidence: 'high',
      stallCount,
      basedOnSessions,
      reasoning: `No improvement in ${stallCount} consecutive sessions at ${weightLabel(lastWeightStr)}. A deload reduces weight by ${params.deloadPct}% to break through the plateau, then build back up.`,
      altWeight: null,
      altReps: null,
      altText: null,
      healthAdvisory: null,
    };
  }

  // --- Deload: BW exercise stalled ---
  if (stallCount >= params.stallThreshold && allBW) {
    const deloadReps = Math.max(repMin - 2, 1);
    return {
      recommendedWeight: 'BW',
      recommendedReps: deloadReps,
      recommendationType: 'deload',
      recommendationText: `Deload → ${deloadReps} reps @ BW`,
      confidence: 'high',
      stallCount,
      basedOnSessions,
      reasoning: `No improvement in ${stallCount} consecutive sessions. Dropping reps to ${deloadReps} to reset and build back up.`,
      altWeight: null,
      altReps: null,
      altText: null,
      healthAdvisory: null,
    };
  }

  // --- BW exercise (never used added weight) ---
  if (allBW && !hasUsedAddedWeight) {
    if (allSetsAtTop) {
      const targetReps = repMax + 1;
      return {
        recommendedWeight: 'BW',
        recommendedReps: targetReps,
        recommendationType: 'increase_reps',
        recommendationText: `→ try ${targetReps} reps @ BW`,
        confidence: basedOnSessions >= 3 ? 'medium' : 'low',
        stallCount,
        basedOnSessions,
        reasoning: `All sets hit ${repMax} reps — push past the rep ceiling to keep progressing at bodyweight.`,
        altWeight: null,
        altReps: null,
        altText: null,
        healthAdvisory: null,
      };
    } else {
      const minReps = Math.min(...lastRepsPerSet);
      const targetReps = Math.min(minReps + 1, repMax);
      return {
        recommendedWeight: 'BW',
        recommendedReps: targetReps,
        recommendationType: 'increase_reps',
        recommendationText: `→ try ${targetReps} reps @ BW`,
        confidence: basedOnSessions >= 3 ? 'medium' : 'low',
        stallCount,
        basedOnSessions,
        reasoning: `Working towards ${repMax} reps on all sets at bodyweight — focus on bringing weaker sets up.`,
        altWeight: null,
        altReps: null,
        altText: null,
        healthAdvisory: null,
      };
    }
  }

  // --- BW exercise that has used added weight before → suggest adding weight ---
  if (allBW && hasUsedAddedWeight && allSetsAtTop) {
    return {
      recommendedWeight: String(params.minIncrement),
      recommendedReps: repMin,
      recommendationType: 'add_weight_to_bw',
      recommendationText: `→ ${repMin} reps @ +${params.minIncrement}kg`,
      confidence: 'medium',
      stallCount,
      basedOnSessions,
      reasoning: `All sets at ${repMax} reps with bodyweight — time to add ${params.minIncrement}kg and work back up from ${repMin} reps.`,
      altWeight: null,
      altReps: null,
      altText: null,
      healthAdvisory: null,
    };
  }

  // --- Weighted exercise — all sets at top → primary: increase weight ---
  if (lastWeight != null && allSetsAtTop) {
    const increment = computeIncrement(lastWeight, params);
    const newWeight = roundToNearest(lastWeight + increment, 2.5);
    // Alt: stay at current weight, push reps beyond range
    const altTargetReps = repMax + 1;
    return {
      recommendedWeight: String(newWeight),
      recommendedReps: repMin,
      recommendationType: 'increase_weight',
      recommendationText: `→ ${repMin} reps @ ${newWeight}kg`,
      confidence: basedOnSessions >= 3 ? 'high' : 'medium',
      stallCount,
      basedOnSessions,
      reasoning: `All sets hit ${repMax} reps at ${lastWeight}kg — ready to increase weight. Drop reps to ${repMin} and build back up.`,
      altWeight: String(lastWeight),
      altReps: altTargetReps,
      altText: `→ try ${altTargetReps} reps @ ${lastWeight}kg`,
      healthAdvisory: null,
    };
  }

  // --- Weighted exercise — not at top → primary: increase reps ---
  if (lastWeight != null) {
    const minReps = Math.min(...lastRepsPerSet);
    const targetReps = Math.min(minReps + 1, repMax);
    // Alt: bump weight, reset reps
    const increment = computeIncrement(lastWeight, params);
    const altNewWeight = roundToNearest(lastWeight + increment, 2.5);
    return {
      recommendedWeight: String(lastWeight),
      recommendedReps: targetReps,
      recommendationType: 'increase_reps',
      recommendationText: `→ try ${targetReps} reps @ ${lastWeight}kg`,
      confidence: 'medium',
      stallCount,
      basedOnSessions,
      reasoning: `Working towards ${repMax} reps at ${lastWeight}kg — focus on adding reps before increasing weight.`,
      altWeight: String(altNewWeight),
      altReps: repMin,
      altText: `→ ${repMin} reps @ ${altNewWeight}kg`,
      healthAdvisory: null,
    };
  }

  // Fallback
  return { ...empty, stallCount, basedOnSessions };
}

// --- Health advisory ---

export async function computeHealthAdvisory(userId: string): Promise<string | null> {
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const todayStr = now.toISOString().split('T')[0];
    const startStr = threeDaysAgo.toISOString().split('T')[0];
    const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

    const [healthMetrics, yesterdayMeals, goals] = await Promise.all([
      getDailyHealthMetrics(userId, startStr, todayStr),
      getUserMealsByDate(userId, yesterdayStr),
      getMacroGoal(userId),
    ]);

    const advisories: string[] = [];

    // Sleep check: average over available days
    const sleepEntries = healthMetrics.filter(m => m.sleepHours != null);
    if (sleepEntries.length > 0) {
      const avgSleep = sleepEntries.reduce((sum, m) => sum + m.sleepHours!, 0) / sleepEntries.length;
      if (avgSleep < 6) {
        advisories.push(`Low sleep avg (${avgSleep.toFixed(1)}h over ${sleepEntries.length}d) — recovery may be impaired`);
      }
    }

    // Calorie check: yesterday vs goal
    if (goals && yesterdayMeals.length > 0) {
      const totalCal = yesterdayMeals.reduce((sum, m) => sum + (m.macros?.calories || 0), 0);
      const goalCal = goals.calories;
      if (goalCal > 0 && totalCal < goalCal * 0.8) {
        advisories.push(`Under-ate yesterday (${totalCal}/${goalCal} kcal) — may affect performance`);
      }
    }

    return advisories.length > 0 ? advisories.join('. ') : null;
  } catch {
    return null;
  }
}

// --- Orchestrator: compute recommendations for all exercises after a workout save ---

export async function computeRecommendationsForWorkout(
  userId: string,
  workout: { name?: string; exercises: Exercise[] }
): Promise<void> {
  if (!workout.name) return; // ad-hoc workout, no preset context

  await initDatabase();

  // Find matching preset
  const presets = await getUserPresets(userId);
  const matchingPreset = presets.find(
    p => p.name.toLowerCase() === workout.name!.toLowerCase()
  );

  if (!matchingPreset) return; // no matching preset

  // Compute health advisory once for the session
  const healthAdvisory = await computeHealthAdvisory(userId);

  // For each exercise in the preset, compute and store a recommendation
  for (let i = 0; i < matchingPreset.exercises.length; i++) {
    const presetExercise = matchingPreset.exercises[i];
    if (!presetExercise.name) continue;

    const [history, params] = await Promise.all([
      getWorkoutHistoryForContext(userId, matchingPreset.name, presetExercise.name, 10),
      getProgressionParams(userId, presetExercise.name),
    ]);

    const rec = computeRecommendation(history, params, presetExercise);

    await upsertExerciseRecommendation(userId, {
      presetName: matchingPreset.name,
      exerciseName: presetExercise.name,
      exercisePosition: i,
      recommendedWeight: rec.recommendedWeight,
      recommendedReps: rec.recommendedReps,
      recommendationType: rec.recommendationType,
      recommendationText: rec.recommendationText,
      confidence: rec.confidence,
      basedOnSessions: rec.basedOnSessions,
      stallCount: rec.stallCount,
      reasoning: rec.reasoning,
      altWeight: rec.altWeight,
      altReps: rec.altReps,
      altText: rec.altText,
      healthAdvisory,
    });
  }
}
