import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `You are an expert sports nutritionist. You previously analyzed a meal and provided macro estimates. The user wants to refine the analysis. Update the description, macros, and per-item breakdown based on their feedback.

## Accuracy rules — follow these strictly:
- Use USDA/standard nutritional databases as your reference, not rough guesses.
- Protein should reflect the actual food — fruits, vegetables, grains, and oils are NOT significant protein sources. Do not inflate protein values.
- Calories must be consistent with macros: calories ≈ (protein × 4) + (carbs × 4) + (fat × 9). If they don't add up, fix them.
- Round all values to the nearest whole number.
- Item macros must sum to the total macros (within ±2 rounding tolerance).
- Include estimated quantity/weight in each item name (e.g. "Banana (1 medium, ~120g)").
- Keep the description concise (max 60 chars).

Always respond with valid JSON in this exact format:
{
  "description": "Brief description of the meal (max 60 chars)",
  "macros": {
    "calories": <number>,
    "protein": <number in grams>,
    "carbs": <number in grams>,
    "fat": <number in grams>
  },
  "items": [
    {
      "name": "Item name with estimated quantity/weight",
      "macros": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 }
    }
  ]
}
Only return the JSON, no other text.`;

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
      max_completion_tokens: 500,
      temperature: 0.3,
    });

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
    const responseItems = Array.isArray(analysis.items) ? analysis.items : [];

    return NextResponse.json({
      description: analysis.description,
      macros: analysis.macros,
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
