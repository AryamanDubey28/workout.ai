import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  initDatabase,
  getUserMealsForDateRange,
  getUserSavedMeals,
  getRecentFoodSuggestions,
  clearPendingSuggestions,
  createFoodSuggestion,
} from "@/lib/db";
import { jaccardSimilarity } from "@/lib/textSimilarity";

// --- Zod schema for structured LLM output ---
const SuggestionsOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      name: z.string().describe("Short, descriptive name for the meal"),
      description: z.string().describe("Brief description of the meal contents"),
      calories: z.number().describe("Estimated calories"),
      protein: z.number().describe("Estimated protein in grams"),
      carbs: z.number().describe("Estimated carbs in grams"),
      fat: z.number().describe("Estimated fat in grams"),
      frequency: z.number().describe("How many times this meal appeared in the history"),
    })
  ).describe("Array of food bank suggestions based on frequently logged meals"),
});

// --- Agent state ---
const AgentState = Annotation.Root({
  userId: Annotation<string>,
  mealHistory: Annotation<string>,
  savedMealNames: Annotation<string>,
  savedMealsList: Annotation<Array<{ name: string; description: string }>>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  existingSuggestions: Annotation<string>,
  suggestions: Annotation<z.infer<typeof SuggestionsOutputSchema>["suggestions"]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
});

const FOOD_SIMILARITY_THRESHOLD = 0.5;

// --- Node: Fetch data from DB ---
async function fetchData(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
  try {
    await initDatabase();

    const now = new Date();
    const threeWeeksAgo = new Date(now);
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

    const endDate = now.toISOString().split("T")[0];
    const startDate = threeWeeksAgo.toISOString().split("T")[0];

    const [mealDays, savedMeals, recentSuggestions] = await Promise.all([
      getUserMealsForDateRange(state.userId, startDate, endDate),
      getUserSavedMeals(state.userId),
      getRecentFoodSuggestions(state.userId),
    ]);

    // Flatten all meals
    const allMeals = mealDays.flatMap((day) =>
      day.meals.map((m) => ({
        description: m.description,
        calories: m.macros.calories,
        protein: m.macros.protein,
        carbs: m.macros.carbs,
        fat: m.macros.fat,
        date: day.date,
      }))
    );

    if (allMeals.length < 5) {
      return { error: "Not enough meal history" };
    }

    const mealHistory = allMeals
      .map((m) => `${m.date}: "${m.description}" (${m.calories} cal, ${m.protein}g P, ${m.carbs}g C, ${m.fat}g F)`)
      .join("\n");

    const savedMealNames = savedMeals.length > 0
      ? savedMeals.map((s) => `"${s.name}" - ${s.description}`).join("\n")
      : "(none)";

    const savedMealsList = savedMeals.map((s) => ({
      name: s.name,
      description: s.description,
    }));

    const existingSuggestions = recentSuggestions.length > 0
      ? recentSuggestions.map((s) => `"${s.name}" (${s.status})`).join(", ")
      : "(none)";

    return { mealHistory, savedMealNames, savedMealsList, existingSuggestions };
  } catch (err) {
    console.error("Food suggestion agent - fetchData error:", err);
    return { error: "Failed to fetch data" };
  }
}

// --- Node: Analyze with LLM ---
async function analyze(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};

  try {
    const llm = new ChatOpenAI({
      model: "gpt-5.4",
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const structuredLlm = llm.withStructuredOutput(SuggestionsOutputSchema);

    const result = await structuredLlm.invoke(`You are analyzing a user's meal logging history to suggest meals they should save to their Food Bank for quick logging in the future.

MEAL HISTORY (last 3 weeks):
${state.mealHistory}

EXISTING FOOD BANK ITEMS (do NOT re-suggest these):
${state.savedMealNames}

EXISTING/RECENT SUGGESTIONS (do NOT re-suggest these either):
${state.existingSuggestions}

INSTRUCTIONS:
1. Identify meals that appear 2 or more times in the 3-week history. Use fuzzy matching — variations like "roti + aloo sabji" and "aloo sabji and roti" are the same meal. Similarly "chicken breast rice" and "grilled chicken with rice" may be the same meal.
2. Exclude any meal that is already in the Food Bank (match by semantic similarity, not exact string match).
3. Exclude any meal that is already in existing/recent suggestions.
4. For each suggestion, provide:
   - A clean, concise name (e.g. "Roti with Aloo Sabji")
   - A brief description of what the meal typically contains
   - Estimated average macros (calories, protein, carbs, fat) based on the logged values — average across occurrences
   - The frequency count (how many times it appeared)
5. Return at most 5 suggestions, prioritized by frequency (highest first).
6. If no meals qualify (none appear 2+ times, or all are already saved), return an empty suggestions array.`);

    return { suggestions: result.suggestions };
  } catch (err) {
    console.error("Food suggestion agent - analyze error:", err);
    return { error: "LLM analysis failed" };
  }
}

// --- Node: Save suggestions to DB ---
async function save(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};
  if (!state.suggestions || state.suggestions.length === 0) return {};

  try {
    // Programmatic safety-net: filter out suggestions that are too similar to existing food bank items
    // (LLM is instructed to skip these, but this catches edge cases)
    const savedNames = (state.savedMealsList || []).map((m) => m.name);
    const savedDescriptions = (state.savedMealsList || []).map((m) => m.description);

    const filteredSuggestions = state.suggestions.filter((s) => {
      // Check name similarity against saved meal names AND descriptions
      const similarToName = savedNames.some(
        (name) => jaccardSimilarity(s.name, name) >= FOOD_SIMILARITY_THRESHOLD
      );
      const similarToDesc = savedDescriptions.some(
        (desc) => jaccardSimilarity(s.name, desc) >= FOOD_SIMILARITY_THRESHOLD
      );
      return !similarToName && !similarToDesc;
    });

    if (filteredSuggestions.length === 0) return {};

    // Clear old pending suggestions before writing new batch
    await clearPendingSuggestions(state.userId);

    for (const s of filteredSuggestions) {
      await createFoodSuggestion(state.userId, {
        name: s.name,
        description: s.description,
        macros: {
          calories: Math.round(s.calories),
          protein: Math.round(s.protein),
          carbs: Math.round(s.carbs),
          fat: Math.round(s.fat),
        },
        frequency: s.frequency,
      });
    }
  } catch (err) {
    console.error("Food suggestion agent - save error:", err);
    return { error: "Failed to save suggestions" };
  }

  return {};
}

// --- Build and compile the graph ---
function buildFoodSuggestionGraph() {
  return new StateGraph(AgentState)
    .addNode("fetchData", fetchData)
    .addNode("analyze", analyze)
    .addNode("save", save)
    .addEdge(START, "fetchData")
    .addEdge("fetchData", "analyze")
    .addEdge("analyze", "save")
    .addEdge("save", END)
    .compile();
}

// Singleton compiled graph
let compiledGraph: ReturnType<typeof buildFoodSuggestionGraph> | null = null;

function getGraph() {
  if (!compiledGraph) {
    compiledGraph = buildFoodSuggestionGraph();
  }
  return compiledGraph;
}

// --- Public entry point ---
export async function runFoodSuggestionAgent(userId: string): Promise<void> {
  try {
    const graph = getGraph();
    await graph.invoke({ userId });
  } catch (err) {
    console.error("Food suggestion agent failed:", err);
  }
}
