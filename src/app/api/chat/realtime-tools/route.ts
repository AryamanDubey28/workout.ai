import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import OpenAI from 'openai';
import { createMeal, logUsage } from '@/lib/db';

export const dynamic = 'force-dynamic';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { functionName, functionArgs } = await request.json();

    if (!functionName) {
      return NextResponse.json({ error: 'functionName is required' }, { status: 400 });
    }

    if (functionName === 'log_meal') {
      const description = functionArgs?.description;
      if (!description) {
        return NextResponse.json({ success: false, error: 'Description is missing' });
      }

      const openai = getOpenAI();
      const SYSTEM_PROMPT = `You are an expert nutritionist. Analyze the food described: "${description}".
Return ONLY a valid JSON object in this exact format:
{
  "description": "Brief description of the meal (max 60 chars)",
  "macros": {
    "calories": <number>,
    "protein": <number in grams>,
    "carbs": <number in grams>,
    "fat": <number in grams>
  }
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }],
        max_completion_tokens: 300,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      // Fire-and-forget: log token usage
      if (response.usage) {
        logUsage(session.userId, 'voice_tool', 'gpt-5.4-mini', {
          promptTokens: response.usage.prompt_tokens ?? 0,
          completionTokens: response.usage.completion_tokens ?? 0,
          cachedTokens: (response.usage as any).prompt_tokens_details?.cached_tokens ?? 0,
        }).catch(() => {});
      }

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) throw new Error('Failed to analyze meal');

      let cleanContent = content;
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }

      const analysis = JSON.parse(cleanContent);
      const macros = analysis.macros ?? {};

      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      const savedMeal = await createMeal(session.userId, {
        id: crypto.randomUUID(),
        description: String(analysis.description || '').slice(0, 60),
        macros: {
          calories: Math.round(macros.calories || 0),
          protein: Math.round(macros.protein || 0),
          carbs: Math.round(macros.carbs || 0),
          fat: Math.round(macros.fat || 0),
        },
        date: today.toISOString(),
        category: 'snack'
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Meal logged successfully', 
        meal: savedMeal 
      });
    }

    // Default handler for unknown functions
    return NextResponse.json({ error: `Function ${functionName} not implemented` }, { status: 400 });

  } catch (error: any) {
    console.error('Error executing realtime tool:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}
