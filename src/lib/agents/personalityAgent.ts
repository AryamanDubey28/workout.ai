import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  initDatabase,
  getChatMessages,
  getUserFacts,
  createUserFactsBatch,
  createUserFact,
  deleteAiFactsByCategories,
  deleteUserFact,
  updateUserFact,
  getRecentConversationIds,
  getUserWorkouts,
  getUserMealsForDateRange,
  getMacroGoal,
  getDailyHealthMetrics,
} from "@/lib/db";
import { jaccardSimilarity } from "@/lib/textSimilarity";
import { UserFact, FactCategory } from "@/types/user";
import { Workout } from "@/types/workout";
import { Meal, MacroGoal } from "@/types/meal";

// ============================================================
// SHARED CONSTANTS & HELPERS
// ============================================================

const FACT_CATEGORIES = [
  "health", "diet", "goals", "preferences", "lifestyle", "personality", "training", "adherence",
] as const;

// Categories where AI facts are data-derived and should be refreshed, not accumulated
const BEHAVIORAL_CATEGORIES = ["training", "adherence", "lifestyle"];
const SIMILARITY_THRESHOLD = 0.55;
const SOFT_FACT_CAP = 100;

// --- Behavioral data summarization ---

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

  const daysWithWorkouts30 = new Set(last30.map((w) => w.date)).size;
  const daysWithWorkoutsPrev = new Set(prev30.map((w) => w.date)).size;

  const weeksInRange = Math.max(1, Math.ceil((now.getTime() - thirtyDaysAgo.getTime()) / (7 * 86400000)));
  const weeklyAvg = (daysWithWorkouts30 / weeksInRange).toFixed(1);

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

  const sortedDates = [...new Set(last30.map((w) => w.date))].sort();
  let maxGap = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = Math.floor(
      (new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / 86400000
    );
    if (gap > maxGap) maxGap = gap;
  }

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

  const calThreshold = macroGoal.calories * 0.15;
  const proteinThreshold = macroGoal.protein * 0.15;
  const daysOnCalTarget = dayTotals.filter(
    (d) => Math.abs(d.calories - macroGoal.calories) <= calThreshold
  ).length;
  const daysOnProteinTarget = dayTotals.filter(
    (d) => Math.abs(d.protein - macroGoal.protein) <= proteinThreshold
  ).length;

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

  const daysNoMeals = dayTotals.filter((d) => d.mealCount === 0).length;

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

function summarizeHealthPatterns(metrics: any[]): string {
  if (metrics.length === 0) return "No daily health metrics synced.";

  let totalSleep = 0, sleepDays = 0;
  let totalSteps = 0, stepDays = 0;

  for (const m of metrics) {
    if (m.sleepHours) { totalSleep += Number(m.sleepHours); sleepDays++; }
    if (m.steps) { totalSteps += Number(m.steps); stepDays++; }
  }

  const avgSleep = sleepDays > 0 ? (totalSleep / sleepDays).toFixed(1) : "N/A";
  const avgSteps = stepDays > 0 ? Math.round(totalSteps / stepDays).toLocaleString() : "N/A";

  return `Health Metrics (Past 14 Days):\n- Recorded Days: ${metrics.length}\n- Average Sleep: ${avgSleep} hours/night\n- Average Daily Steps: ${avgSteps}`;
}

async function fetchBehavioralContext(userId: string): Promise<string> {
  const now = new Date();
  const twoWeeksAgo = new Date(now);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksAgoKey = twoWeeksAgo.toISOString().split("T")[0];
  const todayKey = now.toISOString().split("T")[0];

  const [workouts, mealHistory, macroGoal, healthMetrics] = await Promise.all([
    getUserWorkouts(userId),
    getUserMealsForDateRange(userId, twoWeeksAgoKey, todayKey),
    getMacroGoal(userId),
    getDailyHealthMetrics(userId, twoWeeksAgoKey, todayKey),
  ]);

  const workoutSummary = summarizeWorkoutPatterns(workouts);
  const mealSummary = summarizeMealAdherence(mealHistory, macroGoal);
  const healthSummary = summarizeHealthPatterns(healthMetrics);

  return `WORKOUT PATTERNS:\n${workoutSummary}\n\nMEAL & MACRO ADHERENCE:\n${mealSummary}\n\nLIFESTYLE & HEALTH:\n${healthSummary}`;
}

// ============================================================
// MODE A: INCREMENTAL EXTRACTION (runs after chat messages)
// ============================================================

const ExtractedFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        category: z
          .enum(FACT_CATEGORIES)
          .describe("The category this fact belongs to"),
        content: z
          .string()
          .describe(
            "A concise, third-person statement about the user (e.g., 'Is vegetarian', 'Has a shoulder injury')"
          ),
      })
    )
    .describe("Array of new personal facts extracted from the conversation. Return empty if nothing worth capturing."),
});

const IncrementalState = Annotation.Root({
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

async function incrementalFetchContext(
  state: typeof IncrementalState.State
): Promise<Partial<typeof IncrementalState.State>> {
  try {
    await initDatabase();

    const [messages, existingFacts, behavioralContext] = await Promise.all([
      getChatMessages(state.conversationId, 50),
      getUserFacts(state.userId),
      fetchBehavioralContext(state.userId),
    ]);

    const userMessages = messages.filter((m) => m.role === "user");
    if (userMessages.length < 3) {
      return { error: "Not enough user messages to extract facts" };
    }

    const chatMessages = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");

    const existingFactsText =
      existingFacts.length > 0
        ? existingFacts.map((f) => `[${f.category}] ${f.content}`).join("\n")
        : "(none)";

    return {
      chatMessages,
      existingFacts: existingFactsText,
      existingFactsList: existingFacts,
      behavioralContext,
    };
  } catch (err) {
    console.error("Personality agent - incrementalFetchContext error:", err);
    return { error: "Failed to fetch context" };
  }
}

async function incrementalExtractFacts(
  state: typeof IncrementalState.State
): Promise<Partial<typeof IncrementalState.State>> {
  if (state.error) return {};

  try {
    const llm = new ChatOpenAI({
      model: "gpt-5.4",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const structuredLlm = llm.withStructuredOutput(ExtractedFactsSchema);

    const result = await structuredLlm.invoke(
      `You are a memory curator for a fitness coaching app. Your job is to extract meaningful personal insights from conversations that would help the AI coach personalize future interactions.

CONVERSATION:
${state.chatMessages}

EXISTING KNOWN FACTS (do NOT re-extract these — they are already saved):
${state.existingFacts}

BEHAVIORAL DATA (for reference — the chat system already has access to this raw data):
${state.behavioralContext}

INSTRUCTIONS:

1. SELECTIVITY IS KEY. Only extract facts when the user shares something genuinely personal. If the conversation is purely about exercise form, workout logistics, or general fitness questions with no personal revelations — return an EMPTY facts array. Quality over quantity.

2. What to extract (organized by category):
   - health: Injuries, conditions, physical limitations (e.g., "Has a rotator cuff injury", "Deals with lower back pain")
   - diet: Dietary preferences, restrictions, allergies, relationship with food (e.g., "Is vegetarian", "Finds cutting mentally challenging")
   - goals: Fitness goals, weight goals, timelines, motivations (e.g., "Wants to compete in a powerlifting meet", "Cutting for summer")
   - preferences: Workout style preferences, schedule preferences, equipment, coaching style preferences (e.g., "Prefers push/pull/legs", "Likes direct yes-or-no coaching")
   - training: High-level training patterns — qualitative only (e.g., "Trains consistently on weekdays", "Recently increased training volume", "Primarily does strength training")
   - adherence: Diet consistency patterns — qualitative only (e.g., "Struggles with diet on weekends", "Very consistent meal tracker", "Tends to under-eat on rest days")
   - lifestyle: Qualitative activity/sleep patterns (e.g., "Highly active outside the gym", "Consistently gets insufficient sleep", "Has a sedentary desk job")
   - personality: Mindset, emotional patterns, motivation style (e.g., "Responds well to encouragement", "Gets impatient with slow progress", "Anxious about eating late at night")

3. CRITICAL RULES:
   - NO specific numbers for volatile metrics. Do NOT write "Averages 8,777 steps per day" or "Gets 6.1 hours of sleep" or "Hits protein target 80% of the time". The chat system already has raw data with exact numbers. Facts should capture the PATTERN qualitatively (e.g., "Gets insufficient sleep" not "Averages 4.9 hours of sleep").
   - Write in third person, concise (one short sentence per fact)
   - Only capture stable patterns, NOT one-off observations
   - Must be genuinely NEW — not a rephrasing of an existing fact

4. DEDUPLICATION: Two facts are duplicates if they convey the same underlying insight, even with different wording. If an existing fact covers the same topic, do NOT add a new one.

5. Return at most 5 new facts per analysis. Prefer fewer, higher-quality facts.

6. If nothing worth capturing, return an empty facts array. This is the expected outcome for most routine conversations.`
    );

    return { extractedFacts: result.facts };
  } catch (err) {
    console.error("Personality agent - incrementalExtractFacts error:", err);
    return { error: "LLM extraction failed" };
  }
}

async function incrementalDeduplicateAndSave(
  state: typeof IncrementalState.State
): Promise<Partial<typeof IncrementalState.State>> {
  if (state.error) return {};
  if (!state.extractedFacts || state.extractedFacts.length === 0) return {};

  try {
    const behavioralFacts = state.extractedFacts.filter((f) =>
      BEHAVIORAL_CATEGORIES.includes(f.category)
    );
    const stableFacts = state.extractedFacts.filter(
      (f) => !BEHAVIORAL_CATEGORIES.includes(f.category)
    );

    // For behavioral categories: clear old AI facts and replace with fresh ones
    if (behavioralFacts.length > 0) {
      await deleteAiFactsByCategories(state.userId, BEHAVIORAL_CATEGORIES);

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

    // For stable categories: dedup against existing facts
    if (stableFacts.length > 0) {
      const existingContents = state.existingFactsList
        .filter((f) => !BEHAVIORAL_CATEGORIES.includes(f.category))
        .map((f) => f.content);

      const newStableFacts = stableFacts.filter((fact) => {
        return !existingContents.some(
          (existing) => jaccardSimilarity(fact.content, existing) >= SIMILARITY_THRESHOLD
        );
      });

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
    console.error("Personality agent - incrementalDeduplicateAndSave error:", err);
    return { error: "Failed to save facts" };
  }

  return {};
}

function buildIncrementalGraph() {
  return new StateGraph(IncrementalState)
    .addNode("fetchContext", incrementalFetchContext)
    .addNode("extractFacts", incrementalExtractFacts)
    .addNode("deduplicateAndSave", incrementalDeduplicateAndSave)
    .addEdge(START, "fetchContext")
    .addEdge("fetchContext", "extractFacts")
    .addEdge("extractFacts", "deduplicateAndSave")
    .addEdge("deduplicateAndSave", END)
    .compile();
}

let incrementalGraph: ReturnType<typeof buildIncrementalGraph> | null = null;

function getIncrementalGraph() {
  if (!incrementalGraph) {
    incrementalGraph = buildIncrementalGraph();
  }
  return incrementalGraph;
}

// ============================================================
// MODE B: COMPACTION REVIEW (runs on profile load / periodically)
// ============================================================

const CompactionActionsSchema = z.object({
  actions: z
    .array(
      z.union([
        z.object({
          type: z.literal("keep"),
          id: z.string().describe("The fact ID to keep unchanged"),
        }),
        z.object({
          type: z.literal("update"),
          id: z.string().describe("The fact ID to update"),
          content: z.string().describe("The revised fact content"),
          category: z.enum(FACT_CATEGORIES).describe("The category (can change)"),
        }),
        z.object({
          type: z.literal("delete"),
          id: z.string().describe("The fact ID to delete"),
          reason: z.string().describe("Brief reason for deletion"),
        }),
        z.object({
          type: z.literal("add"),
          content: z.string().describe("New fact content to add"),
          category: z.enum(FACT_CATEGORIES).describe("The category for the new fact"),
        }),
      ])
    )
    .describe("Actions to take on the user's fact memory. Every existing AI fact must have a keep, update, or delete action."),
});

type CompactionAction = z.infer<typeof CompactionActionsSchema>["actions"][number];

const CompactionState = Annotation.Root({
  userId: Annotation<string>,
  aiFacts: Annotation<UserFact[]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  userAddedFacts: Annotation<UserFact[]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  behavioralContext: Annotation<string>({
    reducer: (_a, b) => b ?? "",
    default: () => "",
  }),
  recentChatContext: Annotation<string>({
    reducer: (_a, b) => b ?? "",
    default: () => "",
  }),
  actions: Annotation<CompactionAction[]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
});

async function compactionFetchContext(
  state: typeof CompactionState.State
): Promise<Partial<typeof CompactionState.State>> {
  try {
    await initDatabase();

    const [allFacts, behavioralContext, conversationIds] = await Promise.all([
      getUserFacts(state.userId),
      fetchBehavioralContext(state.userId),
      getRecentConversationIds(state.userId, 3),
    ]);

    // Separate AI-extracted (reviewable) from user-added (read-only)
    const aiFacts = allFacts.filter((f) => f.source === "ai_extracted");
    const userAddedFacts = allFacts.filter((f) => f.source === "user_added");

    // Fetch recent conversation messages for context
    let recentChatContext = "";
    for (const convId of conversationIds) {
      try {
        const messages = await getChatMessages(convId, 30);
        if (messages.length > 0) {
          const transcript = messages
            .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
            .join("\n");
          recentChatContext += `\n--- Conversation ---\n${transcript}\n`;
        }
      } catch {
        // Skip failed conversations
      }
    }

    return {
      aiFacts,
      userAddedFacts,
      behavioralContext,
      recentChatContext: recentChatContext || "(no recent conversations)",
    };
  } catch (err) {
    console.error("Compaction agent - fetchContext error:", err);
    return { error: "Failed to fetch context for compaction" };
  }
}

async function compactionReview(
  state: typeof CompactionState.State
): Promise<Partial<typeof CompactionState.State>> {
  if (state.error) return {};

  // If no AI facts exist, just extract from behavioral data
  const hasAiFacts = state.aiFacts.length > 0;

  try {
    const llm = new ChatOpenAI({
      model: "gpt-5.4",
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const structuredLlm = llm.withStructuredOutput(CompactionActionsSchema);

    // Format existing AI facts with IDs and timestamps
    const aiFactsList = state.aiFacts.map((f) => {
      const age = Math.floor((Date.now() - new Date(f.updatedAt).getTime()) / 86400000);
      return `  ID: ${f.id} | Category: ${f.category} | Age: ${age}d | Content: "${f.content}"`;
    }).join("\n");

    // Format user-added facts (read-only context)
    const userFactsList = state.userAddedFacts.length > 0
      ? state.userAddedFacts.map((f) => `  [${f.category}] ${f.content}`).join("\n")
      : "(none)";

    const result = await structuredLlm.invoke(
      `You are a memory manager for a fitness coaching app. Your job is to curate the AI's knowledge about this user — keeping it accurate, concise, non-redundant, and useful for personalizing coaching.

${hasAiFacts ? `EXISTING AI-EXTRACTED FACTS (you MUST review each one — keep, update, or delete):
${aiFactsList}` : "No existing AI-extracted facts yet."}

USER-ADDED FACTS (read-only — do NOT touch these, but consider them for context):
${userFactsList}

CURRENT BEHAVIORAL DATA (raw metrics the chat system already has access to):
${state.behavioralContext}

RECENT CONVERSATIONS (for extracting new insights):
${state.recentChatContext}

INSTRUCTIONS:

You are performing a FULL REVIEW of this user's fact memory. Think of this like managing a living document — a CLAUDE.md for the user.

${hasAiFacts ? `1. REVIEW every AI fact above. For each one, output exactly one action:
   - "keep" — fact is accurate, useful, and not redundant. Use the fact's ID.
   - "update" — fact is partially correct but needs revision (e.g., outdated info, could be more concise, category should change). Use the fact's ID + provide new content/category.
   - "delete" — fact is stale, redundant with another fact, redundant with raw data, or no longer accurate. Use the fact's ID + brief reason.` : "1. No existing facts to review."}

2. MERGE duplicates: If two facts say essentially the same thing, keep the better one and delete the other.

3. DELETE facts that just restate raw data with specific numbers. The chat system already has exact step counts, sleep hours, calorie numbers, etc. Facts should capture QUALITATIVE patterns instead:
   BAD (delete): "Averages about 13.1k steps per day", "Gets 6.1 hours of sleep"
   GOOD (keep/add): "Maintains a high daily activity level outside the gym", "Consistently gets insufficient sleep"

4. ADD new facts if the behavioral data or recent conversations reveal meaningful patterns not yet captured. Use qualitative language for behavioral insights.

5. Fact quality rules:
   - Third person, concise (one short sentence)
   - Captures a stable pattern or personal trait, NOT a one-off observation
   - No specific numbers for volatile metrics (steps, sleep hours, calorie counts)
   - Each fact should provide unique value — no overlap with other facts
   - Don't duplicate information that user-added facts already cover

6. SOFT CAP: Aim for at most ~${SOFT_FACT_CAP} AI facts total. If currently over, prioritize deletion of low-value facts. This isn't a hard limit — keeping ${SOFT_FACT_CAP + 10} high-quality facts is better than deleting useful ones to hit a number.

7. Categories:
   - health: Injuries, conditions, physical limitations
   - diet: Dietary preferences, restrictions, relationship with food
   - goals: Fitness goals, weight goals, motivations, timelines
   - preferences: Workout/coaching style preferences, schedule, equipment
   - training: Qualitative training patterns and consistency
   - adherence: Qualitative diet tracking and consistency patterns
   - lifestyle: Qualitative activity/sleep/lifestyle patterns
   - personality: Mindset, emotional patterns, motivation style

${hasAiFacts ? "8. EVERY existing AI fact must be accounted for with a keep, update, or delete action. Do not skip any." : "8. Since there are no existing facts, focus on adding new ones from the behavioral data and conversations."}`
    );

    return { actions: result.actions };
  } catch (err) {
    console.error("Compaction agent - review error:", err);
    return { error: "LLM compaction review failed" };
  }
}

async function compactionExecuteActions(
  state: typeof CompactionState.State
): Promise<Partial<typeof CompactionState.State>> {
  if (state.error) return {};
  if (!state.actions || state.actions.length === 0) return {};

  const validIds = new Set(state.aiFacts.map((f) => f.id));
  let kept = 0, updated = 0, deleted = 0, added = 0, skipped = 0;

  try {
    for (const action of state.actions) {
      switch (action.type) {
        case "keep":
          if (validIds.has(action.id)) {
            kept++;
          } else {
            skipped++;
          }
          break;

        case "update":
          if (validIds.has(action.id)) {
            await updateUserFact(state.userId, action.id, action.content, action.category as FactCategory);
            updated++;
          } else {
            skipped++;
          }
          break;

        case "delete":
          if (validIds.has(action.id)) {
            await deleteUserFact(state.userId, action.id);
            deleted++;
          } else {
            skipped++;
          }
          break;

        case "add":
          await createUserFact(state.userId, {
            category: action.category as FactCategory,
            content: action.content,
            source: "ai_extracted",
          });
          added++;
          break;
      }
    }

    console.log(
      `Compaction complete for user ${state.userId}: ${kept} kept, ${updated} updated, ${deleted} deleted, ${added} added, ${skipped} skipped (invalid IDs)`
    );
  } catch (err) {
    console.error("Compaction agent - executeActions error:", err);
    return { error: "Failed to execute compaction actions" };
  }

  return {};
}

function buildCompactionGraph() {
  return new StateGraph(CompactionState)
    .addNode("fetchContext", compactionFetchContext)
    .addNode("reviewAndCompact", compactionReview)
    .addNode("executeActions", compactionExecuteActions)
    .addEdge(START, "fetchContext")
    .addEdge("fetchContext", "reviewAndCompact")
    .addEdge("reviewAndCompact", "executeActions")
    .addEdge("executeActions", END)
    .compile();
}

let compactionGraph: ReturnType<typeof buildCompactionGraph> | null = null;

function getCompactionGraph() {
  if (!compactionGraph) {
    compactionGraph = buildCompactionGraph();
  }
  return compactionGraph;
}

// ============================================================
// PUBLIC ENTRY POINTS
// ============================================================

/** Incremental extraction: analyze a single conversation for new facts */
export async function runPersonalityAgent(
  userId: string,
  conversationId: string
): Promise<void> {
  try {
    const graph = getIncrementalGraph();
    await graph.invoke({ userId, conversationId });
  } catch (err) {
    console.error("Personality agent (incremental) failed:", err);
  }
}

/** Full compaction review: curate all facts (runs on profile load / periodically) */
export async function runPersonalityAgentBatch(
  userId: string
): Promise<void> {
  try {
    const graph = getCompactionGraph();
    await graph.invoke({ userId });
  } catch (err) {
    console.error("Personality agent (compaction) failed:", err);
  }
}
