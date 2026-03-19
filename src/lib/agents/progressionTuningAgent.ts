import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  initDatabase,
  getRecentWorkoutsWithExercises,
  getProgressionParams,
  upsertProgressionParams,
  ProgressionParams,
  logUsage,
  UsageTracker,
} from "@/lib/db";
import { Exercise } from "@/types/workout";

// --- Zod schema for structured LLM output ---
const ProgressionAnalysisSchema = z.object({
  exercises: z.array(
    z.object({
      exerciseName: z.string().describe("Canonical exercise name"),
      exerciseCategory: z.enum(["compound", "isolation", "bodyweight", "machine", "unknown"])
        .describe("Exercise category based on movement pattern"),
      weightIncrement: z.number().describe("Recommended absolute weight increment in kg"),
      weightIncrementPct: z.number().describe("Recommended weight increment as percentage of current weight"),
      stallThreshold: z.number().describe("Number of consecutive stalled sessions before suggesting deload"),
      deloadPct: z.number().describe("Percentage to drop weight for deload"),
      minIncrement: z.number().describe("Minimum weight increment in kg"),
      maxIncrement: z.number().describe("Maximum weight increment in kg"),
      successRate: z.number().describe("Estimated historical success rate (0-100) when progressing weight"),
    })
  ).describe("Tuned progression parameters per exercise"),
});

// --- Agent state ---
const AgentState = Annotation.Root({
  userId: Annotation<string>,
  workoutHistory: Annotation<string>,
  currentParams: Annotation<string>,
  exerciseList: Annotation<string[]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  updatedParams: Annotation<z.infer<typeof ProgressionAnalysisSchema>["exercises"]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
});

// --- Node: Fetch data from DB ---
async function fetchData(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
  try {
    await initDatabase();

    const now = new Date();
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const sinceDate = ninetyDaysAgo.toISOString().split("T")[0];

    const workouts = await getRecentWorkoutsWithExercises(state.userId, sinceDate);

    if (workouts.length < 3) {
      return { error: "Not enough workout history for analysis" };
    }

    // Extract unique exercise names across all workouts
    const exerciseSet = new Set<string>();
    for (const w of workouts) {
      for (const ex of w.exercises) {
        if (ex.name) exerciseSet.add(ex.name);
      }
    }
    const exerciseList = Array.from(exerciseSet);

    // Fetch current params for all exercises
    const currentParamsList: ProgressionParams[] = [];
    for (const name of exerciseList) {
      const params = await getProgressionParams(state.userId, name);
      currentParamsList.push(params);
    }

    // Serialize workout history for LLM context
    const workoutHistory = workouts.map((w) => {
      const exerciseSummary = w.exercises.map((ex: Exercise, i: number) => {
        const weight = ex.weight || "BW";
        const repsPerSet = ex.repsPerSet?.join(",") || String(ex.reps || 0);
        return `  ${i + 1}. ${ex.name} - ${weight} × ${ex.sets || 0}s [${repsPerSet}]`;
      }).join("\n");
      return `${w.date} - ${w.name || "unnamed"}:\n${exerciseSummary}`;
    }).join("\n\n");

    const currentParams = currentParamsList.map((p) =>
      `${p.exerciseName}: category=${p.exerciseCategory}, increment=${p.weightIncrement ?? "auto"}kg (${p.weightIncrementPct ?? 5}%), stall_threshold=${p.stallThreshold}, deload=${p.deloadPct}%, success_rate=${p.successRate ?? "unknown"}`
    ).join("\n");

    return { workoutHistory, currentParams, exerciseList };
  } catch (err) {
    console.error("Progression tuning agent - fetchData error:", err);
    return { error: "Failed to fetch workout data" };
  }
}

// --- Node: Analyze with LLM ---
async function analyze(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};

  try {
    const tracker = new UsageTracker();
    const llm = new ChatOpenAI({
      model: "gpt-5.4",
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY,
      callbacks: [tracker.getHandler()],
    });

    const structuredLlm = llm.withStructuredOutput(ProgressionAnalysisSchema);

    const result = await structuredLlm.invoke(`You are an expert strength coach analyzing a user's workout history to optimize their progressive overload parameters.

WORKOUT HISTORY (last 90 days, most recent first):
${state.workoutHistory}

CURRENT PROGRESSION PARAMETERS:
${state.currentParams}

EXERCISES TO ANALYZE:
${state.exerciseList.join(", ")}

INSTRUCTIONS:
For each exercise in the list, analyze the workout history and provide optimized progression parameters:

1. **Categorize** each exercise:
   - compound: Multi-joint movements (bench press, squat, deadlift, rows, overhead press, pull-ups, dips)
   - isolation: Single-joint movements (bicep curl, tricep extension, lateral raise, leg curl)
   - bodyweight: Exercises typically done without external weight (push-ups, planks, crunches, sit-ups)
   - machine: Machine-based exercises (leg press, cable fly, lat pulldown)

2. **Analyze progression patterns**:
   - Look at weight changes over time for each exercise
   - Calculate how often weight increases succeeded (user maintained or increased reps after a weight jump)
   - Identify exercises where the user is stuck (same weight/reps for many sessions)

3. **Set optimal increment sizes**:
   - Compound lifts typically progress at 2.5-5kg
   - Isolation exercises typically progress at 1.25-2.5kg
   - Consider the user's actual successful progression history
   - If the user has consistently added X kg successfully, recommend close to that
   - weightIncrement should be the absolute amount, weightIncrementPct the relative amount

4. **Adjust stall thresholds**:
   - Compounds: 3 sessions is standard
   - Isolations: 3-4 sessions (smaller muscles recover differently)
   - If an exercise shows frequent stalls, consider increasing the threshold slightly

5. **Set deload percentages**:
   - Standard: 10% for compounds, 10-15% for isolations
   - If the user recovers quickly from deloads (based on history), can use smaller deloads

6. **Success rate**: Estimate 0-100 based on how often the user successfully progressed when attempting a weight/rep increase.

Return parameters for ALL exercises in the list. Be data-driven — base your recommendations on the actual patterns you see in the history, not just general guidelines.`);

    // Fire-and-forget: log token usage
    if (tracker.usage) {
      logUsage(state.userId, 'progression_tuning', 'gpt-5.4', tracker.usage).catch(() => {});
    }

    return { updatedParams: result.exercises };
  } catch (err) {
    console.error("Progression tuning agent - analyze error:", err);
    return { error: "LLM analysis failed" };
  }
}

// --- Node: Save tuned params to DB ---
async function save(state: typeof AgentState.State): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};
  if (!state.updatedParams || state.updatedParams.length === 0) return {};

  try {
    for (const p of state.updatedParams) {
      await upsertProgressionParams(state.userId, p.exerciseName, {
        exerciseCategory: p.exerciseCategory,
        weightIncrement: p.weightIncrement,
        weightIncrementPct: p.weightIncrementPct,
        stallThreshold: p.stallThreshold,
        deloadPct: p.deloadPct,
        minIncrement: p.minIncrement,
        maxIncrement: p.maxIncrement,
        successRate: p.successRate,
      });
    }
  } catch (err) {
    console.error("Progression tuning agent - save error:", err);
    return { error: "Failed to save tuned parameters" };
  }

  return {};
}

// --- Build and compile the graph ---
function buildProgressionGraph() {
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
let compiledGraph: ReturnType<typeof buildProgressionGraph> | null = null;

function getGraph() {
  if (!compiledGraph) {
    compiledGraph = buildProgressionGraph();
  }
  return compiledGraph;
}

// --- Public entry point ---
export async function runProgressionTuningAgent(userId: string): Promise<void> {
  try {
    const graph = getGraph();
    await graph.invoke({ userId });
  } catch (err) {
    console.error("Progression tuning agent failed:", err);
  }
}
