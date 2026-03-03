import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  initDatabase,
  getChatMessages,
  getUserFacts,
  createUserFactsBatch,
  deleteAiFactsByCategories,
  getRecentConversationIds,
  getUserWorkouts,
  getUserMealsForDateRange,
  getMacroGoal,
} from "@/lib/db";
import { jaccardSimilarity } from "@/lib/textSimilarity";
import { UserFact, FactCategory } from "@/types/user";
import { Workout } from "@/types/workout";
import { Meal, MacroGoal } from "@/types/meal";

// --- Zod schema for structured LLM output ---
const ExtractedFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        category: z
          .enum(["health", "diet", "goals", "preferences", "lifestyle", "personality", "training", "adherence"])
          .describe("The category this fact belongs to"),
        content: z
          .string()
          .describe(
            "A concise, third-person statement about the user (e.g., 'Is vegetarian', 'Has a shoulder injury')"
          ),
      })
    )
    .describe("Array of new personal facts extracted from the conversation"),
});

// --- Agent state ---
const AgentState = Annotation.Root({
  userId: Annotation<string>,
  conversationId: Annotation<string>,
  chatMessages: Annotation<string>,
  existingFacts: Annotation<string>,
  existingFactsList: Annotation<UserFact[]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  behavioralContext: Annotation<string>({
    reducer: (_a, b) => b ?? "",
    default: () => "",
  }),
  extractedFacts: Annotation<z.infer<typeof ExtractedFactsSchema>["facts"]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
});

// --- Helpers for behavioral data summarization ---

function summarizeWorkoutPatterns(workouts: Workout[]): string {
  if (workouts.length === 0) return "No workout history.";

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const last30 = workouts.filter((w) => new Date(w.date) >= thirtyDaysAgo);
  const prev30 = workouts.filter(
    (w) => new Date(w.date) >= sixtyDaysAgo && new Date(w.date) < thirtyDaysAgo
  );

  // Workout frequency
  const daysWithWorkouts30 = new Set(last30.map((w) => w.date)).size;
  const daysWithWorkoutsPrev = new Set(prev30.map((w) => w.date)).size;

  // Weekly frequency
  const weeksInRange = Math.max(1, Math.ceil((now.getTime() - thirtyDaysAgo.getTime()) / (7 * 86400000)));
  const weeklyAvg = (daysWithWorkouts30 / weeksInRange).toFixed(1);

  // Day of week distribution
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayCounts: Record<string, number> = {};
  for (const w of last30) {
    const day = dayNames[new Date(w.date).getDay()];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  const sortedDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([day, count]) => `${day}: ${count}`)
    .join(", ");

  // Workout types
  const typeCounts: Record<string, number> = {};
  for (const w of last30) {
    const name = w.name || "Unnamed";
    typeCounts[name] = (typeCounts[name] || 0) + 1;
  }
  const topWorkouts = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name}: ${count}x`)
    .join(", ");

  // Gaps — consecutive days without workout
  const sortedDates = [...new Set(last30.map((w) => w.date))].sort();
  let maxGap = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = Math.floor(
      (new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / 86400000
    );
    if (gap > maxGap) maxGap = gap;
  }

  // Strength vs run split
  const strengthCount = last30.filter((w) => w.type === "strength" || !w.type).length;
  const runCount = last30.filter((w) => w.type === "run").length;

  const lines = [
    `Total workouts (past 30d): ${last30.length} (previous 30d: ${prev30.length})`,
    `Unique workout days (past 30d): ${daysWithWorkouts30} (previous 30d: ${daysWithWorkoutsPrev})`,
    `Weekly average: ${weeklyAvg} sessions/week`,
    `Day distribution (past 30d): ${sortedDays || "none"}`,
    `Top workouts: ${topWorkouts || "none"}`,
    `Longest gap between sessions: ${maxGap} days`,
  ];

  if (runCount > 0) {
    lines.push(`Split: ${strengthCount} strength, ${runCount} runs`);
  }

  return lines.join("\n");
}

function summarizeMealAdherence(
  mealsByDay: { date: string; meals: Meal[] }[],
  macroGoal: MacroGoal | null
): string {
  if (mealsByDay.length === 0) return "No meal history.";
  if (!macroGoal) return "No macro goals set — cannot assess adherence.";

  const dayTotals = mealsByDay.map((day) => {
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    for (const m of day.meals) {
      totals.calories += m.macros?.calories || 0;
      totals.protein += m.macros?.protein || 0;
      totals.carbs += m.macros?.carbs || 0;
      totals.fat += m.macros?.fat || 0;
    }
    return { date: day.date, ...totals, mealCount: day.meals.length };
  });

  const daysTracked = dayTotals.length;
  const avgCals = Math.round(dayTotals.reduce((s, d) => s + d.calories, 0) / daysTracked);
  const avgProtein = Math.round(dayTotals.reduce((s, d) => s + d.protein, 0) / daysTracked);

  // Adherence: within 15% of goal
  const calThreshold = macroGoal.calories * 0.15;
  const proteinThreshold = macroGoal.protein * 0.15;
  const daysOnCalTarget = dayTotals.filter(
    (d) => Math.abs(d.calories - macroGoal.calories) <= calThreshold
  ).length;
  const daysOnProteinTarget = dayTotals.filter(
    (d) => Math.abs(d.protein - macroGoal.protein) <= proteinThreshold
  ).length;

  // Weekend vs weekday adherence
  const weekendDays = dayTotals.filter((d) => {
    const dow = new Date(d.date).getDay();
    return dow === 0 || dow === 6;
  });
  const weekdayDays = dayTotals.filter((d) => {
    const dow = new Date(d.date).getDay();
    return dow !== 0 && dow !== 6;
  });

  const avgCalsWeekend = weekendDays.length
    ? Math.round(weekendDays.reduce((s, d) => s + d.calories, 0) / weekendDays.length)
    : 0;
  const avgCalsWeekday = weekdayDays.length
    ? Math.round(weekdayDays.reduce((s, d) => s + d.calories, 0) / weekdayDays.length)
    : 0;

  // Days with no meals logged
  const daysNoMeals = dayTotals.filter((d) => d.mealCount === 0).length;

  // Consistency: how many of the last 14 calendar days had meals logged
  const now = new Date();
  const last14 = new Set<string>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    last14.add(d.toISOString().split("T")[0]);
  }
  const daysLogged = dayTotals.filter((d) => last14.has(d.date)).length;

  const lines = [
    `Macro goal: ${macroGoal.calories} cal, ${macroGoal.protein}g protein, ${macroGoal.carbs}g carbs, ${macroGoal.fat}g fat (${macroGoal.goalType})`,
    `Days tracked (past 2wk): ${daysTracked}`,
    `Days logged meals (past 14 calendar days): ${daysLogged}/14`,
    `Average daily intake: ${avgCals} cal, ${avgProtein}g protein`,
    `Days within calorie target (±15%): ${daysOnCalTarget}/${daysTracked}`,
    `Days within protein target (±15%): ${daysOnProteinTarget}/${daysTracked}`,
    `Weekday avg calories: ${avgCalsWeekday}, Weekend avg calories: ${avgCalsWeekend}`,
  ];

  if (daysNoMeals > 0) {
    lines.push(`Days with no meals logged: ${daysNoMeals}`);
  }

  return lines.join("\n");
}

// --- Node: Fetch context from DB ---
async function fetchContext(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  try {
    await initDatabase();

    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoKey = twoWeeksAgo.toISOString().split("T")[0];
    const todayKey = now.toISOString().split("T")[0];

    const [messages, existingFacts, workouts, mealHistory, macroGoal] = await Promise.all([
      getChatMessages(state.conversationId, 50),
      getUserFacts(state.userId),
      getUserWorkouts(state.userId),
      getUserMealsForDateRange(state.userId, twoWeeksAgoKey, todayKey),
      getMacroGoal(state.userId),
    ]);

    // Only proceed if there are enough user messages to analyze
    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length < 3) {
      return { error: "Not enough user messages to extract facts" };
    }

    // Format chat transcript
    const chatMessages = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    // Format existing facts for dedup context
    const existingFactsText =
      existingFacts.length > 0
        ? existingFacts.map((f) => `[${f.category}] ${f.content}`).join("\n")
        : "(none)";

    // Build behavioral context
    const workoutSummary = summarizeWorkoutPatterns(workouts);
    const mealSummary = summarizeMealAdherence(mealHistory, macroGoal);
    const behavioralContext = `WORKOUT PATTERNS:\n${workoutSummary}\n\nMEAL & MACRO ADHERENCE:\n${mealSummary}`;

    return {
      chatMessages,
      existingFacts: existingFactsText,
      existingFactsList: existingFacts,
      behavioralContext,
    };
  } catch (err) {
    console.error("Personality agent - fetchContext error:", err);
    return { error: "Failed to fetch context" };
  }
}

// --- Node: Extract facts with LLM ---
async function extractFacts(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};

  try {
    const llm = new ChatOpenAI({
      model: "gpt-5.2",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const structuredLlm = llm.withStructuredOutput(ExtractedFactsSchema);

    const result = await structuredLlm.invoke(
      `You are analyzing a fitness app user's conversation AND their actual workout/meal data. Your job is to extract personal facts AND behavioral insights that would help personalize future interactions.

CONVERSATION:
${state.chatMessages}

EXISTING KNOWN FACTS (do NOT re-extract these — they are already saved):
${state.existingFacts}

BEHAVIORAL DATA:
${state.behavioralContext}

INSTRUCTIONS:
1. Extract facts from BOTH the conversation and the behavioral data. Look for:
   - Health conditions, injuries, physical limitations (category: health)
   - Dietary preferences, restrictions, allergies (category: diet)
   - Fitness goals, weight goals, training objectives (category: goals)
   - Workout preferences, schedule preferences, equipment access (category: preferences)
   - Training frequency, consistency, workout type patterns, rest day patterns (category: training)
     Examples: "Trains 5x per week consistently", "Mostly trains on weekdays", "Prefers push/pull/legs split", "Takes weekends off", "Training frequency dropped recently"
   - Macro adherence, diet consistency, tracking habits, weekend vs weekday patterns (category: adherence)
     Examples: "Consistently hits protein targets", "Struggles with diet on weekends", "Tracks meals daily", "Tends to under-eat on rest days", "Calorie intake often exceeds goal by 200+"
   - Lifestyle factors: job type, sleep habits, stress, family situation (category: lifestyle)
   - Personality traits, mindset, emotional relationship with fitness (category: personality)

2. For behavioral facts (training, adherence), analyze the DATA objectively:
   - Compare actual workout frequency to what the user says or to reasonable expectations
   - Check calorie/macro adherence rates and identify patterns (weekday vs weekend, consistency)
   - Note gaps, trends, or notable patterns
   - Be specific with numbers where possible (e.g., "Averages 4.2 sessions/week" not just "Works out often")

3. Each fact should be:
   - Written in third person (e.g., "Trains 5x per week" not "I train 5x per week")
   - Concise (one short sentence)
   - A stable pattern, NOT a one-off observation
   - Genuinely NEW — not a rephrasing of an existing fact

4. CRITICAL DEDUPLICATION: Two facts are duplicates if they convey the same underlying information, even with different wording.
   For example, these pairs are ALL duplicates — do NOT return the second if the first exists:
   - "Tracks nutrition daily" ↔ "Logs meals essentially every day"
   - "Trains on average 2.8 sessions per week" ↔ "Averages 2.8 workouts per week"
   - "Has ankle mobility limitations" ↔ "Has ankle mobility and balance limitations that affect Bulgarian split squats"
   - "Calorie intake is highly consistent" ↔ "Calorie intake adherence is very high"
   If an existing fact covers the same topic with similar or more detail, do NOT add a new one.

5. Only extract conversation-based facts the user explicitly stated or strongly implied.
   Behavioral facts should be based on clear patterns in the data (not single data points).

6. If no new facts can be extracted, return an empty facts array.

7. Return at most 7 new facts per analysis.`
    );

    return { extractedFacts: result.facts };
  } catch (err) {
    console.error("Personality agent - extractFacts error:", err);
    return { error: "LLM extraction failed" };
  }
}

// Categories where AI facts are data-derived and should be refreshed, not accumulated
const BEHAVIORAL_CATEGORIES = ["training", "adherence"];
const SIMILARITY_THRESHOLD = 0.5;

// --- Node: Deduplicate and save to DB ---
async function deduplicateAndSave(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};
  if (!state.extractedFacts || state.extractedFacts.length === 0) return {};

  try {
    // Split extracted facts into behavioral (refreshable) and stable
    const behavioralFacts = state.extractedFacts.filter((f) =>
      BEHAVIORAL_CATEGORIES.includes(f.category)
    );
    const stableFacts = state.extractedFacts.filter(
      (f) => !BEHAVIORAL_CATEGORIES.includes(f.category)
    );

    // For behavioral categories: clear old AI facts and replace with fresh ones
    if (behavioralFacts.length > 0) {
      await deleteAiFactsByCategories(state.userId, BEHAVIORAL_CATEGORIES);

      // Dedup behavioral facts against each other (in case LLM returns internal dupes)
      const dedupedBehavioral: typeof behavioralFacts = [];
      for (const fact of behavioralFacts) {
        const isDupe = dedupedBehavioral.some(
          (existing) => jaccardSimilarity(fact.content, existing.content) >= SIMILARITY_THRESHOLD
        );
        if (!isDupe) dedupedBehavioral.push(fact);
      }

      if (dedupedBehavioral.length > 0) {
        await createUserFactsBatch(
          state.userId,
          dedupedBehavioral.map((f) => ({
            category: f.category as FactCategory,
            content: f.content,
            source: "ai_extracted" as const,
          }))
        );
      }
    }

    // For stable categories: dedup against existing facts using Jaccard similarity
    if (stableFacts.length > 0) {
      const existingContents = state.existingFactsList
        .filter((f) => !BEHAVIORAL_CATEGORIES.includes(f.category))
        .map((f) => f.content);

      const newStableFacts = stableFacts.filter((fact) => {
        return !existingContents.some(
          (existing) => jaccardSimilarity(fact.content, existing) >= SIMILARITY_THRESHOLD
        );
      });

      // Also dedup new stable facts against each other
      const dedupedStable: typeof newStableFacts = [];
      for (const fact of newStableFacts) {
        const isDupe = dedupedStable.some(
          (existing) => jaccardSimilarity(fact.content, existing.content) >= SIMILARITY_THRESHOLD
        );
        if (!isDupe) dedupedStable.push(fact);
      }

      if (dedupedStable.length > 0) {
        await createUserFactsBatch(
          state.userId,
          dedupedStable.map((f) => ({
            category: f.category as FactCategory,
            content: f.content,
            source: "ai_extracted" as const,
          }))
        );
      }
    }
  } catch (err) {
    console.error("Personality agent - deduplicateAndSave error:", err);
    return { error: "Failed to save facts" };
  }

  return {};
}

// --- Build and compile the graph ---
function buildPersonalityGraph() {
  return new StateGraph(AgentState)
    .addNode("fetchContext", fetchContext)
    .addNode("extractFacts", extractFacts)
    .addNode("deduplicateAndSave", deduplicateAndSave)
    .addEdge(START, "fetchContext")
    .addEdge("fetchContext", "extractFacts")
    .addEdge("extractFacts", "deduplicateAndSave")
    .addEdge("deduplicateAndSave", END)
    .compile();
}

// Singleton compiled graph
let compiledGraph: ReturnType<typeof buildPersonalityGraph> | null = null;

function getGraph() {
  if (!compiledGraph) {
    compiledGraph = buildPersonalityGraph();
  }
  return compiledGraph;
}

// --- Public entry points ---

/** Analyze a single conversation for personality facts */
export async function runPersonalityAgent(
  userId: string,
  conversationId: string
): Promise<void> {
  try {
    const graph = getGraph();
    await graph.invoke({ userId, conversationId });
  } catch (err) {
    console.error("Personality agent failed:", err);
  }
}

/** Batch analyze recent conversations (used as catch-up on profile load) */
export async function runPersonalityAgentBatch(
  userId: string
): Promise<void> {
  try {
    await initDatabase();
    const conversationIds = await getRecentConversationIds(userId, 3);

    for (const convId of conversationIds) {
      try {
        const graph = getGraph();
        await graph.invoke({ userId, conversationId: convId });
      } catch (err) {
        console.error(`Personality agent batch failed for conv ${convId}:`, err);
      }
    }
  } catch (err) {
    console.error("Personality agent batch failed:", err);
  }
}
