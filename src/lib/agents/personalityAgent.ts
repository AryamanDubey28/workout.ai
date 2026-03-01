import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import {
  initDatabase,
  getChatMessages,
  getUserFacts,
  createUserFactsBatch,
  getRecentConversationIds,
} from "@/lib/db";
import { UserFact, FactCategory } from "@/types/user";

// --- Zod schema for structured LLM output ---
const ExtractedFactsSchema = z.object({
  facts: z
    .array(
      z.object({
        category: z
          .enum(["health", "diet", "goals", "preferences", "lifestyle", "personality"])
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
  extractedFacts: Annotation<z.infer<typeof ExtractedFactsSchema>["facts"]>({
    reducer: (_a, b) => b ?? [],
    default: () => [],
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
});

// --- Node: Fetch context from DB ---
async function fetchContext(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  try {
    await initDatabase();

    const [messages, existingFacts] = await Promise.all([
      getChatMessages(state.conversationId, 50),
      getUserFacts(state.userId),
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

    return {
      chatMessages,
      existingFacts: existingFactsText,
      existingFactsList: existingFacts,
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
      `You are analyzing a conversation between a fitness AI assistant and a user. Your job is to extract personal facts about the user that would help personalize future interactions.

CONVERSATION:
${state.chatMessages}

EXISTING KNOWN FACTS (do NOT re-extract these — they are already saved):
${state.existingFacts}

INSTRUCTIONS:
1. Extract facts about the user from their messages. Look for:
   - Health conditions, injuries, physical limitations (category: health)
   - Dietary preferences, restrictions, allergies (category: diet)
   - Fitness goals, weight goals, training objectives (category: goals)
   - Workout preferences, schedule preferences, equipment access (category: preferences)
   - Lifestyle factors: job type, sleep habits, stress, family situation (category: lifestyle)
   - Personality traits, mindset, emotional relationship with fitness (category: personality)

2. Each fact should be:
   - Written in third person (e.g., "Is vegetarian" not "I am vegetarian")
   - Concise (one short sentence)
   - A stable personal fact, NOT a transient observation (skip things like "had a good workout today")
   - Genuinely NEW — not a rephrasing of an existing fact

3. Only extract facts the user explicitly stated or strongly implied. Do NOT infer or speculate.

4. If no new facts can be extracted, return an empty facts array.

5. Return at most 5 new facts per analysis.`
    );

    return { extractedFacts: result.facts };
  } catch (err) {
    console.error("Personality agent - extractFacts error:", err);
    return { error: "LLM extraction failed" };
  }
}

// --- Node: Deduplicate and save to DB ---
async function deduplicateAndSave(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};
  if (!state.extractedFacts || state.extractedFacts.length === 0) return {};

  try {
    // Safety-net dedup: check if any existing fact content overlaps
    // (LLM is already instructed to avoid dupes, this catches edge cases)
    const existingContents = state.existingFactsList.map((f) =>
      f.content.toLowerCase()
    );

    const newFacts = state.extractedFacts.filter((fact) => {
      const lower = fact.content.toLowerCase();
      return !existingContents.some(
        (existing) => existing.includes(lower) || lower.includes(existing)
      );
    });

    if (newFacts.length === 0) return {};

    await createUserFactsBatch(
      state.userId,
      newFacts.map((f) => ({
        category: f.category as FactCategory,
        content: f.content,
        source: "ai_extracted" as const,
      }))
    );
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
