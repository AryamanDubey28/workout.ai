import { UserFact } from '@/types/user';

// ── Utility helpers ──

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function capitalize(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSetsRepsCompact(ex: any): string {
  if (ex.useEffectiveReps) {
    return `ER ${ex.effectiveRepsMax}/${ex.effectiveRepsTarget}`;
  }
  if (ex.repsPerSet && ex.repsPerSet.length > 0) {
    const allSame = ex.repsPerSet.every((r: number) => r === ex.repsPerSet[0]);
    if (allSame) return `${ex.repsPerSet.length}x${ex.repsPerSet[0]}`;
    return `${ex.repsPerSet.length}x${ex.repsPerSet.join(',')}`;
  }
  return `${ex.sets || 0}x${ex.reps || 0}`;
}

function formatExerciseCompact(ex: any): string {
  const w = ex.weight === 'BW' ? 'BW' : ex.weight ? `${ex.weight}kg` : '';

  if (ex.useEffectiveReps) {
    return `${ex.name} ${w} ER ${ex.effectiveRepsMax}/${ex.effectiveRepsTarget}`.trim();
  }

  if (ex.weightsPerSet && ex.weightsPerSet.length > 0) {
    const parts = ex.weightsPerSet.map((wt: any, i: number) => {
      const wtStr = wt === 'BW' ? 'BW' : wt ? `${wt}kg` : '?';
      const reps = ex.repsPerSet?.[i] ?? '?';
      return `${wtStr}x${reps}`;
    });
    return `${ex.name} ${parts.join(',')}`.trim();
  }

  if (ex.repsPerSet && ex.repsPerSet.length > 0) {
    const allSame = ex.repsPerSet.every((r: number) => r === ex.repsPerSet[0]);
    if (allSame) {
      return `${ex.name} ${w} ${ex.repsPerSet.length}x${ex.repsPerSet[0]}`.trim();
    }
    return `${ex.name} ${w} ${ex.repsPerSet.length}x${ex.repsPerSet.join(',')}`.trim();
  }

  return `${ex.name} ${w} ${ex.sets || 0}x${ex.reps || 0}`.trim();
}

function formatWorkoutCompact(w: any): string {
  const date = new Date(w.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const name = w.name || 'Untitled';
  let details = '';
  if ((w.type || 'strength') === 'run' && w.runData) {
    const rd = w.runData;
    const pace = rd.distanceKm > 0 ? ((rd.durationSeconds / 60) / rd.distanceKm).toFixed(1) : '?';
    details = `Run: ${rd.distanceKm}km, ${Math.floor(rd.durationSeconds / 60)}min, ${pace} min/km`;
    if (w.exercises.length > 0) {
      details += ' + ' + w.exercises.map(formatExerciseCompact).join(' | ');
    }
  } else {
    details = w.exercises.map(formatExerciseCompact).join(' | ');
  }
  return `${date} ${name}: ${details}`;
}

function buildExerciseProgressions(workouts: any[]): string {
  const exerciseMap = new Map<string, {
    displayName: string;
    sessions: number;
    firstDate: Date;
    lastDate: Date;
    firstWeight: number;
    lastWeight: number;
    peakWeight: number;
    lastSetsReps: string;
    isBW: boolean;
  }>();

  // Iterate oldest-first to build chronological progression
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i];
    const date = new Date(w.date);
    for (const ex of w.exercises) {
      const key = ex.name.toLowerCase().trim();
      const weight = ex.weight === 'BW' ? -1 : parseFloat(ex.weight) || 0;
      const numericWeight = weight === -1 ? 0 : weight;

      const existing = exerciseMap.get(key);
      if (!existing) {
        exerciseMap.set(key, {
          displayName: ex.name,
          sessions: 1,
          firstDate: date,
          lastDate: date,
          firstWeight: numericWeight,
          lastWeight: numericWeight,
          peakWeight: numericWeight,
          lastSetsReps: formatSetsRepsCompact(ex),
          isBW: ex.weight === 'BW',
        });
      } else {
        existing.sessions++;
        existing.lastDate = date;
        existing.lastWeight = numericWeight;
        if (numericWeight > existing.peakWeight) existing.peakWeight = numericWeight;
        existing.lastSetsReps = formatSetsRepsCompact(ex);
      }
    }
  }

  const entries = Array.from(exerciseMap.entries())
    .sort((a, b) => b[1].sessions - a[1].sessions || a[0].localeCompare(b[0]));

  const lines = entries.map(([, data]) => {
    const first = data.firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const last = data.lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (data.isBW) {
      return `${capitalize(data.displayName)}: ${data.sessions}x, ${first}–${last}, BW, last: ${data.lastSetsReps}`;
    }

    const weightProgression = data.firstWeight === data.lastWeight
      ? `${data.lastWeight}kg`
      : `${data.firstWeight}kg→${data.lastWeight}kg`;
    const peak = data.peakWeight > data.lastWeight ? ` (peak ${data.peakWeight}kg)` : '';

    return `${capitalize(data.displayName)}: ${data.sessions}x, ${first}–${last}, ${weightProgression}${peak}, last: ${data.lastSetsReps}`;
  });

  return lines.join('\n');
}

// ── Exported formatting functions ──

export function formatWorkoutsForContext(workouts: any[]): string {
  if (workouts.length === 0) return 'No workouts recorded yet.';

  const RECENT_COUNT = 15;
  const MAX_WORKOUT_TOKENS = 45000;

  // Section 1: Exercise progression summaries
  const progressionSection = `EXERCISE PROGRESSION SUMMARY (${workouts.length} total workouts):\n`
    + buildExerciseProgressions(workouts);

  // Section 2: Recent workouts in full detail
  const recentWorkouts = workouts.slice(0, RECENT_COUNT);
  const recentSection = 'RECENT WORKOUTS (detailed):\n' + recentWorkouts
    .map((w) => {
      const date = new Date(w.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const name = w.name || 'Untitled';
      const note = typeof w.note === 'string' ? w.note.trim() : '';
      const exercises = w.exercises
        .map((ex: any) => {
          const weight = ex.weight === 'BW' ? 'BW' : ex.weight ? `${ex.weight}kg` : '';
          if (ex.useEffectiveReps) {
            return `  - ${ex.name} ${weight} ER ${ex.effectiveRepsMax}/${ex.effectiveRepsTarget}`;
          }
          if (ex.weightsPerSet && ex.weightsPerSet.length > 0) {
            const parts = ex.weightsPerSet.map((wt: any, i: number) => {
              const wtStr = wt === 'BW' ? 'BW' : wt ? `${wt}kg` : '?';
              const reps = ex.repsPerSet?.[i] ?? '?';
              return `${wtStr}x${reps}`;
            });
            return `  - ${ex.name} ${parts.join(', ')}`;
          }
          if (ex.repsPerSet && ex.repsPerSet.length > 0) {
            const sets = ex.repsPerSet.length;
            const repsStr = ex.repsPerSet.join(', ');
            return `  - ${ex.name} ${weight} ${sets} sets (${repsStr} reps)`;
          }
          return `  - ${ex.name} ${weight} ${ex.sets || 0}x${ex.reps || 0}`;
        })
        .join('\n');
      const noteLine = note ? `  Note: ${note}\n` : '';
      let runLine = '';
      if ((w.type || 'strength') === 'run' && w.runData) {
        const rd = w.runData;
        const pace = rd.distanceKm > 0 ? ((rd.durationSeconds / 60) / rd.distanceKm).toFixed(1) : '?';
        runLine = `  Run: ${rd.distanceKm}km in ${Math.floor(rd.durationSeconds / 60)}m ${rd.durationSeconds % 60}s (pace: ${pace} min/km)\n`;
      }
      return `${date} - ${name}:\n${noteLine}${runLine}${exercises}`;
    })
    .join('\n\n');

  // Section 3: Older workouts in compact format (with dynamic budget)
  const olderWorkouts = workouts.slice(RECENT_COUNT);

  let olderSection = '';
  if (olderWorkouts.length > 0) {
    const tokensUsedSoFar = estimateTokens(progressionSection) + estimateTokens(recentSection);
    const remainingBudget = MAX_WORKOUT_TOKENS - tokensUsedSoFar;

    const compactLines: string[] = [];
    let compactTokens = 0;
    const headerLine = `OLDER WORKOUTS (compact, ${olderWorkouts.length} workouts):`;
    compactTokens += estimateTokens(headerLine);

    for (const w of olderWorkouts) {
      const line = formatWorkoutCompact(w);
      const lineTokens = estimateTokens(line);
      if (compactTokens + lineTokens > remainingBudget) {
        const remaining = olderWorkouts.length - compactLines.length;
        compactLines.push(`... and ${remaining} more older workouts (progression summary above covers all)`);
        break;
      }
      compactLines.push(line);
      compactTokens += lineTokens;
    }

    olderSection = headerLine + '\n' + compactLines.join('\n');
  }

  const sections = [progressionSection, recentSection];
  if (olderSection) sections.push(olderSection);
  return sections.join('\n\n');
}

export function formatMealsForContext(meals: any[]): string {
  if (meals.length === 0) return 'No meals logged today.';

  const mealLines = meals.map((m) => {
    return `  - ${m.description}: ${m.macros.calories} cal, ${m.macros.protein}g protein, ${m.macros.carbs}g carbs, ${m.macros.fat}g fat`;
  });

  const totals = meals.reduce(
    (acc: any, m: any) => ({
      calories: acc.calories + m.macros.calories,
      protein: acc.protein + m.macros.protein,
      carbs: acc.carbs + m.macros.carbs,
      fat: acc.fat + m.macros.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return `${mealLines.join('\n')}\n  Total so far: ${totals.calories} cal, ${totals.protein}g protein, ${totals.carbs}g carbs, ${totals.fat}g fat`;
}

export function formatMealHistoryForContext(
  mealDays: { date: string; meals: any[] }[],
  todayKey: string
): string {
  const historyDays = mealDays.filter((d) => d.date !== todayKey);
  if (historyDays.length === 0) return 'No meal history in the past 2 weeks.';

  const lines = historyDays.map((day) => {
    const dateLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const totals = day.meals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.macros.calories,
        protein: acc.protein + m.macros.protein,
        carbs: acc.carbs + m.macros.carbs,
        fat: acc.fat + m.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const mealList = day.meals
      .map((m: any) => `${m.category}: ${m.description} (${m.macros.calories} cal, ${m.macros.protein}g P)`)
      .join('; ');
    return `${dateLabel} — ${totals.calories} cal, ${totals.protein}g P, ${totals.carbs}g C, ${totals.fat}g F [${mealList}]`;
  });

  return lines.join('\n');
}

export function formatGoalForContext(goal: any): string {
  if (!goal) return 'No macro goals set.';
  return `Goal: ${goal.goalType} - ${goal.calories} cal, ${goal.protein}g protein, ${goal.carbs}g carbs, ${goal.fat}g fat daily`;
}

export function formatUserFactsForContext(facts: UserFact[]): string {
  if (facts.length === 0) return '';

  const categoryLabels: Record<string, string> = {
    health: 'Health & Injuries',
    diet: 'Diet & Nutrition',
    goals: 'Goals & Motivation',
    preferences: 'Training Preferences',
    training: 'Training Patterns',
    adherence: 'Habits & Adherence',
    lifestyle: 'Lifestyle',
    personality: 'Personality',
  };

  const grouped = new Map<string, string[]>();
  for (const fact of facts) {
    const list = grouped.get(fact.category) || [];
    list.push(fact.content);
    grouped.set(fact.category, list);
  }

  return Array.from(grouped.entries())
    .map(([cat, items]) => `${categoryLabels[cat] || cat}: ${items.join('; ')}`)
    .join('\n');
}

export function formatBodyweightForContext(rawWeight: unknown): string {
  const weightLbs = Number(rawWeight);
  if (!Number.isFinite(weightLbs)) return 'unknown';

  const weightKg = weightLbs * 0.45359237;
  const lbs = Number.isInteger(weightLbs) ? `${weightLbs}` : weightLbs.toFixed(1);
  const kg = weightKg.toFixed(1);
  return `${lbs} lb (${kg} kg)`;
}

export function formatUserProfileForContext(user: any, goal: any): string {
  if (!user) {
    return 'Age: unknown. Weight: unknown. Height: not set. Sex: not set. Activity level: not set.';
  }

  const age = user.age ?? 'unknown';
  const weight = formatBodyweightForContext(user.weight);
  const height = goal?.heightCm ? `${goal.heightCm} cm` : 'not set';
  const sex = goal?.sex || 'not set';
  const activityLevel = goal?.activityLevel || 'not set';

  return `Age: ${age}. Weight: ${weight}. Height: ${height}. Sex: ${sex}. Activity level: ${activityLevel}.`;
}

export function formatHealthMetricsForContext(metrics: any[]): string {
  if (metrics.length === 0) return 'No recent daily health metrics available.';

  const lines = metrics.map((m) => {
    const date = new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const parts = [];
    if (m.sleepHours) parts.push(`${m.sleepHours}h sleep`);
    if (m.steps) parts.push(`${m.steps.toLocaleString()} steps`);
    if (m.activeCalories) parts.push(`${m.activeCalories} active cal`);
    if (m.restingHeartRate) parts.push(`${m.restingHeartRate} bpm RHR`);
    if (m.vo2Max) parts.push(`${m.vo2Max} VO2Max`);

    return `   - ${date}: ${parts.length > 0 ? parts.join(', ') : 'no data'}`;
  });

  return `Daily Health Metrics (Past 7 Days):\n${lines.join('\n')}`;
}
