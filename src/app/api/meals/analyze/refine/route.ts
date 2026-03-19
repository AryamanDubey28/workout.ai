import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { logUsage } from '@/lib/db';
import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `You are an expert sports nutritionist. You previously analyzed a meal and provided macro estimates. The user wants to refine the analysis. Update the description, macros, and per-item breakdown based on their feedback.

## Accuracy rules — follow these strictly:
- Use USDA/standard nutritional databases as your reference, not rough guesses.
- Protein should reflect the actual food — fruits, vegetables, grains, and oils are NOT significant protein sources. Do not inflate protein values.
- Calories must be consistent with macros: calories ≈ (protein × 4) + (carbs × 4) + (fat × 9). If they don't add up, fix them.
- Round all values to the nearest whole number (integers only).

## Decomposition rules — follow these for consistent breakdowns:
- ALWAYS break composite/multi-ingredient foods into their individual components (e.g. a sandwich → bread, filling, spread, vegetables separately).
- Single-ingredient foods stay as one item (e.g. "Banana", "Apple", "Boiled egg").
- For each item, use this naming format: "Ingredient (quantity, ~weight)" — e.g. "White bread (2 slices, ~60g)", "Butter (1 tbsp, ~14g)".
- Order items from highest calorie to lowest.
- Combine trivial garnishes/seasonings (<5 cal total) into one "Seasonings & garnish" item.

## Output format:
- Return valid JSON with description, macros, and items.
- Item macros must sum to the total macros (within ±2 rounding tolerance).
- Keep the description concise (max 60 chars).
- All macro values must be whole numbers (integers, no decimals).

Respond with this exact JSON structure:
{
  "description": "Brief description of the meal (max 60 chars)",
  "macros": {
    "calories": <integer>,
    "protein": <integer>,
    "carbs": <integer>,
    "fat": <integer>
  },
  "items": [
    {
      "name": "Ingredient (quantity, ~weight)",
      "macros": { "calories": <integer>, "protein": <integer>, "carbs": <integer>, "fat": <integer> }
    }
  ]
}`;

// POST /api/meals/analyze/refine - Refine a meal analysis based on user feedback
export async function POST(request: NextRequest) {
  try {
    const openai = getOpenAI();
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { description, macros, items, refinement, context } = body;
    const contextText = typeof context === 'string' ? context.trim().slice(0, 500) : '';

    if (!description || !macros || !refinement) {
      return NextResponse.json(
        { error: 'Missing required fields: description, macros, refinement' },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'assistant',
          content: JSON.stringify({ description, macros, items }),
        },
        {
          role: 'user',
          content: contextText
            ? `Original meal context from user: ${contextText}\n\nPlease update the analysis: ${refinement}`
            : `Please update the analysis: ${refinement}`,
        },
      ],
      max_completion_tokens: 800,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    // Fire-and-forget: log token usage
    if (response.usage) {
      logUsage(session.userId, 'meal_refine', 'gpt-5.4', {
        promptTokens: response.usage.prompt_tokens ?? 0,
        completionTokens: response.usage.completion_tokens ?? 0,
        cachedTokens: (response.usage as any).prompt_tokens_details?.cached_tokens ?? 0,
      }).catch(() => {});
    }

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    // Parse the JSON response - handle potential markdown code blocks
    let cleanContent = content;
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const analysis = JSON.parse(cleanContent);

    // Defensive fallback for items
    const rawItems = Array.isArray(analysis.items) ? analysis.items : [];

    // Post-process: round all macro values to integers and validate
    const responseItems = rawItems.map((item: any) => ({
      name: String(item.name || 'Unknown item'),
      macros: {
        calories: Math.round(item.macros?.calories || 0),
        protein: Math.round(item.macros?.protein || 0),
        carbs: Math.round(item.macros?.carbs || 0),
        fat: Math.round(item.macros?.fat || 0),
      },
    }));

    // Recompute totals from items so breakdown always matches header
    const responseMacros = responseItems.length > 0
      ? responseItems.reduce(
          (acc: any, item: any) => ({
            calories: acc.calories + item.macros.calories,
            protein: acc.protein + item.macros.protein,
            carbs: acc.carbs + item.macros.carbs,
            fat: acc.fat + item.macros.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        )
      : {
          calories: Math.round(analysis.macros?.calories || 0),
          protein: Math.round(analysis.macros?.protein || 0),
          carbs: Math.round(analysis.macros?.carbs || 0),
          fat: Math.round(analysis.macros?.fat || 0),
        };

    // Validate calorie consistency: recalculate from macros if off by >10%
    const computedCal = (responseMacros.protein * 4) + (responseMacros.carbs * 4) + (responseMacros.fat * 9);
    if (responseMacros.calories > 0 && Math.abs(responseMacros.calories - computedCal) / responseMacros.calories > 0.10) {
      responseMacros.calories = Math.round(computedCal);
    }

    return NextResponse.json({
      description: String(analysis.description || '').slice(0, 60),
      macros: responseMacros,
      items: responseItems,
    });
  } catch (error: any) {
    console.error('Error refining meal analysis:', error);

    if (error?.code === 'invalid_api_key' || error?.status === 401) {
      return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to refine analysis' }, { status: 500 });
  }
}
