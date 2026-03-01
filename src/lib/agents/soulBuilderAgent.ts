import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { initDatabase, upsertAiSoul } from "@/lib/db";
import { SoulPresetId } from "@/types/user";

// --- Preset definitions ---

export interface SoulPreset {
  id: SoulPresetId;
  name: string;
  icon: string;
  shortDescription: string;
  seedPrompt: string;
}

export const SOUL_PRESETS: SoulPreset[] = [
  {
    id: "drill_sergeant",
    name: "Drill Sergeant",
    icon: "sergeant",
    shortDescription:
      "Tough love, no excuses. Military-style accountability that pushes you to your limits.",
    seedPrompt:
      "A no-nonsense military drill sergeant. Uses direct, blunt language. Never sugarcoats missed workouts or poor nutrition. Addresses the user as 'recruit' or 'soldier'. Celebrates PRs with restrained approval ('Not bad, recruit'). Disappointed tone when goals are missed. Believes discipline beats motivation every time. Uses short, commanding sentences.",
  },
  {
    id: "hype_coach",
    name: "Hype Coach",
    icon: "hype",
    shortDescription:
      "Maximum energy, maximum hype. Gets excited about every rep and every meal logged.",
    seedPrompt:
      "An incredibly enthusiastic gym coach bursting with energy. Uses exclamation marks liberally, celebrates every single PR no matter how small. Says things like 'LET'S GOOOO' and 'CRUSHED IT'. Treats every workout logged as a win. Uses gym culture language and slang. When the user misses goals, reframes it positively ('Rest day gains, baby!'). Genuinely believes in the user and makes them feel like a champion.",
  },
  {
    id: "wise_mentor",
    name: "Wise Mentor",
    icon: "mentor",
    shortDescription:
      "Calm, philosophical guidance. Focuses on the long game, habits, and mindset.",
    seedPrompt:
      "A calm, wise fitness mentor with decades of experience. Speaks thoughtfully and uses metaphors. Focuses on sustainable habits over quick fixes. References the journey, patience, and self-improvement. When the user misses goals, puts it in perspective ('One missed day is a drop in the ocean of your journey'). Asks reflective questions. Values consistency over intensity. Occasionally shares wisdom about the mind-body connection.",
  },
  {
    id: "friendly_trainer",
    name: "Friendly Trainer",
    icon: "friendly",
    shortDescription:
      "Warm, supportive, and approachable. Like a best friend who's also a certified PT.",
    seedPrompt:
      "A warm, friendly personal trainer who feels like a close friend. Uses casual, conversational language. Celebrates wins with genuine warmth. When the user struggles, offers empathy first, then practical solutions. Makes fitness feel fun and approachable, never intimidating. Uses humor naturally. Remembers personal details and references them. Gives encouragement without being over-the-top.",
  },
  {
    id: "science_nerd",
    name: "Science Nerd",
    icon: "science",
    shortDescription:
      "Data-driven, evidence-based coaching. Loves percentages, studies, and optimization.",
    seedPrompt:
      "A data-obsessed fitness scientist who loves numbers and evidence. References research and training principles. Analyzes workout data like a spreadsheet. Talks about progressive overload percentages, protein synthesis windows, and periodization. When reviewing progress, always includes numbers and trends. When the user misses goals, frames it as 'data points' not failures. Uses precise language. Occasionally geeks out about exercise physiology.",
  },
];

// --- Zod schema for structured output ---

const SoulOutputSchema = z.object({
  name: z
    .string()
    .describe("A short display name for this personality (e.g., 'Drill Sergeant', 'Coach Max')"),
  soulContent: z
    .string()
    .describe("The complete personality prompt that will shape the AI's behavior"),
});

// --- Agent state ---

const AgentState = Annotation.Root({
  userId: Annotation<string>,
  presetId: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
  customInput: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
  generatedName: Annotation<string>({
    reducer: (_a, b) => b ?? "",
    default: () => "",
  }),
  generatedSoul: Annotation<string>({
    reducer: (_a, b) => b ?? "",
    default: () => "",
  }),
  error: Annotation<string | null>({
    reducer: (_a, b) => b ?? null,
    default: () => null,
  }),
});

// --- Node: Build the soul with LLM ---

async function buildSoul(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  try {
    const llm = new ChatOpenAI({
      model: "gpt-5.2",
      temperature: 0.7,
      openAIApiKey: process.env.OPENAI_API_KEY,
    });

    const structuredLlm = llm.withStructuredOutput(SoulOutputSchema);

    // Determine the input — either a preset seed or custom user text
    let userDescription: string;
    if (state.presetId) {
      const preset = SOUL_PRESETS.find((p) => p.id === state.presetId);
      if (!preset) {
        return { error: `Unknown preset: ${state.presetId}` };
      }
      userDescription = `Preset: "${preset.name}"\n\nSeed description: ${preset.seedPrompt}`;
    } else if (state.customInput) {
      userDescription = `Custom user request: ${state.customInput}`;
    } else {
      return { error: "No preset or custom input provided" };
    }

    const result = await structuredLlm.invoke(
      `You are designing a personality for a fitness AI assistant inside a workout & nutrition tracking app. The user has chosen the following personality style:

${userDescription}

Generate a complete personality definition (the "soul") that the AI assistant will embody in ALL conversations. The soul should cover:

1. **Core voice & tone** — How the AI sounds in conversation. Sentence structure, vocabulary, energy level.
2. **How it addresses the user** — Nicknames, terms, level of formality.
3. **Reactions to good progress** — How it celebrates PRs, streak consistency, hitting macro targets.
4. **Reactions to missed goals** — How it handles skipped workouts, missed macros, inconsistency. This is critical: the personality should shine through here.
5. **Coaching philosophy** — What it prioritizes (discipline vs fun, intensity vs longevity, data vs feel).
6. **How it uses personal data** — How it references the user's workout history, meal logs, injuries, and goals. Should feel natural, not robotic.
7. **Humor style** — What kind of humor it uses (if any).
8. **Dietary advice style** — How it talks about nutrition, meal suggestions, macro tracking.

IMPORTANT RULES:
- The soul is a PERSONALITY LAYER, not a replacement for the AI's core knowledge. It should describe HOW to communicate, not WHAT to know.
- Keep it under 500 words — concise but rich.
- Write it as direct instructions to the AI (e.g., "You are...", "When the user...", "Always...").
- The AI still needs to be helpful, knowledgeable, and accurate regardless of personality. The personality affects delivery, not correctness.
- Do NOT include any data formatting rules, workout/meal context instructions, or markdown rules — those are handled separately.
- The personality should feel authentic and consistent, not like a gimmick.

For the name: use the preset name if it's a preset, or create a fitting short name for custom personalities.`
    );

    return {
      generatedName: result.name,
      generatedSoul: result.soulContent,
    };
  } catch (err) {
    console.error("Soul builder - buildSoul error:", err);
    return { error: "Failed to generate soul" };
  }
}

// --- Node: Save soul to DB ---

async function saveSoul(
  state: typeof AgentState.State
): Promise<Partial<typeof AgentState.State>> {
  if (state.error) return {};
  if (!state.generatedSoul) return { error: "No soul generated" };

  try {
    await initDatabase();
    await upsertAiSoul(state.userId, {
      presetId: state.presetId,
      name: state.generatedName,
      soulContent: state.generatedSoul,
      userInput: state.customInput,
    });
  } catch (err) {
    console.error("Soul builder - saveSoul error:", err);
    return { error: "Failed to save soul" };
  }

  return {};
}

// --- Build and compile the graph ---

function buildSoulGraph() {
  return new StateGraph(AgentState)
    .addNode("buildSoul", buildSoul)
    .addNode("saveSoul", saveSoul)
    .addEdge(START, "buildSoul")
    .addEdge("buildSoul", "saveSoul")
    .addEdge("saveSoul", END)
    .compile();
}

let compiledGraph: ReturnType<typeof buildSoulGraph> | null = null;

function getGraph() {
  if (!compiledGraph) {
    compiledGraph = buildSoulGraph();
  }
  return compiledGraph;
}

// --- Public entry point ---

export async function runSoulBuilder(
  userId: string,
  options: { presetId?: string; customInput?: string }
): Promise<{ name: string; soulContent: string } | null> {
  try {
    const graph = getGraph();
    const result = await graph.invoke({
      userId,
      presetId: options.presetId || null,
      customInput: options.customInput || null,
    });

    if (result.error) {
      console.error("Soul builder error:", result.error);
      return null;
    }

    return {
      name: result.generatedName,
      soulContent: result.generatedSoul,
    };
  } catch (err) {
    console.error("Soul builder failed:", err);
    return null;
  }
}
