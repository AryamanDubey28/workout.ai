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
- Estimate portion sizes carefully. If from a photo, use visual cues (plate size, hand/utensil scale) to estimate weight in grams, then calculate macros from that weight.
- Protein should reflect the actual food — fruits, vegetables, grains, and oils are NOT significant protein sources. Do not inflate protein values.
- Calories must be consistent with macros: calories ≈ (protein × 4) + (carbs × 4) + (fat × 9). If they don't add up, fix them.
- Round all values to the nearest whole number.

## Output format:
- Break the meal into individual food items with per-item macros.
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
    const items = Array.isArray(analysis.items) ? analysis.items : [];

    return NextResponse.json({
      description: analysis.description,
      macros: analysis.macros,
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
