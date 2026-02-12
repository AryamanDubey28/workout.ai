import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const SYSTEM_PROMPT = `You are a nutrition analysis assistant. Analyze the food described (or shown in the image) and provide an estimated macro breakdown. Be concise with the description. If the user includes context text, use it to improve the estimate.

Break the meal into individual food items, each with their own macro estimate. The item macros should sum to the total macros (within rounding).

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
      "name": "Item name with estimated quantity",
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
      model: 'gpt-5.2',
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
