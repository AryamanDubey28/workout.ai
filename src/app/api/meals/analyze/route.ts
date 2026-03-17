import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `You are an expert sports nutritionist. Analyze the food described (or shown in the image) and provide an accurate macro breakdown.

## Accuracy rules — follow these strictly:
- Use USDA/standard nutritional databases as your reference, not rough guesses.
- For common foods, use established values. Examples for calibration:
  - 1 medium banana (118g): 105 cal, 1.3g protein, 27g carbs, 0.4g fat
  - 1 large egg: 72 cal, 6.3g protein, 0.4g carbs, 4.8g fat
  - 100g chicken breast (cooked): 165 cal, 31g protein, 0g carbs, 3.6g fat
  - 1 cup cooked white rice (186g): 206 cal, 4.3g protein, 45g carbs, 0.4g fat
  - 1 tbsp olive oil (14g): 119 cal, 0g protein, 0g carbs, 13.5g fat
  - 1 slice white bread (~30g): 79 cal, 2.7g protein, 15g carbs, 1g fat
  - 100g cheddar cheese: 403 cal, 25g protein, 1.3g carbs, 33g fat
  - 1 tbsp butter (14g): 102 cal, 0.1g protein, 0g carbs, 11.5g fat
  - 100g cooked salmon: 208 cal, 20g protein, 0g carbs, 13g fat
- Estimate portion sizes carefully. If from a photo, use visual cues (plate size, hand/utensil scale) to estimate weight in grams, then calculate macros from that weight.
- Protein should reflect the actual food — fruits, vegetables, grains, and oils are NOT significant protein sources. Do not inflate protein values.
- Calories must be consistent with macros: calories ≈ (protein × 4) + (carbs × 4) + (fat × 9). If they don't add up, fix them.
- Round all values to the nearest whole number.

## Decomposition rules — follow these for consistent breakdowns:
- ALWAYS break composite/multi-ingredient foods into their individual components (e.g. a sandwich → bread, filling, spread, vegetables separately).
- Single-ingredient foods stay as one item (e.g. "Banana", "Apple", "Boiled egg").
- For each item, use this naming format: "Ingredient (quantity, ~weight)" — e.g. "White bread (2 slices, ~60g)", "Butter (1 tbsp, ~14g)".
- Order items from highest calorie to lowest.
- Combine trivial garnishes/seasonings (<5 cal total) into one "Seasonings & garnish" item rather than listing them individually.
- If the meal is a single food (e.g. "a banana"), still return it as one item in the items array.

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

// POST /api/meals/analyze - Analyze a meal from text, image, or both
export async function POST(request: NextRequest) {
  try {
    const openai = getOpenAI();
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const textRaw = formData.get('text');
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, 500) : '';
    const contextRaw = formData.get('context');
    const context = typeof contextRaw === 'string' ? contextRaw.trim().slice(0, 500) : '';

    if (!image && !text) {
      return NextResponse.json(
        { error: 'Provide a meal description or photo (or both)' },
        { status: 400 }
      );
    }

    // Build user message content
    const userContent: any[] = [];

    if (image) {
      const bytes = await image.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = image.type || 'image/jpeg';
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: 'low',
        },
      });
    }

    let textPrompt = 'Analyze this meal and estimate the macronutrient breakdown.';
    if (text) textPrompt += `\nMeal description: ${text}`;
    if (context) textPrompt += `\nAdditional context: ${context}`;
    textPrompt += '\nReturn only valid JSON.';

    userContent.push({ type: 'text', text: textPrompt });

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 800,
      temperature: 0.1,
      response_format: { type: 'json_object' },
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
    const rawItems = Array.isArray(analysis.items) ? analysis.items : [];

    // Post-process: round all macro values to integers and validate
    const items = rawItems.map((item: any) => ({
      name: String(item.name || 'Unknown item'),
      macros: {
        calories: Math.round(item.macros?.calories || 0),
        protein: Math.round(item.macros?.protein || 0),
        carbs: Math.round(item.macros?.carbs || 0),
        fat: Math.round(item.macros?.fat || 0),
      },
    }));

    // Recompute totals from items so breakdown always matches header
    const macros = items.length > 0
      ? items.reduce(
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
    const computedCal = (macros.protein * 4) + (macros.carbs * 4) + (macros.fat * 9);
    if (macros.calories > 0 && Math.abs(macros.calories - computedCal) / macros.calories > 0.10) {
      macros.calories = Math.round(computedCal);
    }

    return NextResponse.json({
      description: String(analysis.description || '').slice(0, 60),
      macros,
      items,
    });
  } catch (error: any) {
    console.error('Error analyzing meal:', error);

    if (error?.code === 'invalid_api_key' || error?.status === 401) {
      return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to analyze meal' }, { status: 500 });
  }
}
