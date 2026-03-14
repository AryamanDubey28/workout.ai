import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import {
  initDatabase,
  getUserById,
  getUserWorkouts,
  getUserMealsByDate,
  getUserMealsForDateRange,
  getMacroGoal,
  getChatMessages,
  saveChatMessage,
  clearChatMessages,
  updateConversationTitle,
  touchConversation,
  getUserFacts,
  getAiSoul,
  getDailyHealthMetrics,
} from '@/lib/db';
import OpenAI from 'openai';
import { runPersonalityAgent } from '@/lib/agents/personalityAgent';
import {
  formatWorkoutsForContext,
  formatMealsForContext,
  formatMealHistoryForContext,
  formatGoalForContext,
  formatUserFactsForContext,
  formatUserProfileForContext,
  formatHealthMetricsForContext,
} from '@/lib/chatContext';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function logOpenAIError(context: string, error: any, meta?: Record<string, any>) {
  const err = error ?? {};
  const details = {
    context,
    ...meta,
    name: err?.name,
    message: err?.message,
    status: err?.status,
    code: err?.code,
    type: err?.type,
    request_id: err?.request_id ?? err?.headers?.['x-request-id'],
    error_message: err?.error?.message,
    error_type: err?.error?.type,
    error_code: err?.error?.code,
  };

  console.error('OpenAI error:', details);
  if (err?.cause) {
    console.error('OpenAI error cause:', err.cause);
  }
}

function generateTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 50) return cleaned;
  const truncated = cleaned.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

function isGenericMessage(message: string): boolean {
  const cleaned = message.replace(/\s+/g, ' ').trim().toLowerCase();
  const wordCount = cleaned.split(/\s+/).length;
  const genericPhrases = ['hi', 'hey', 'hello', 'sup', 'yo', 'test', 'ok', 'okay', 'thanks', 'ty', 'help', 'hm', 'hmm'];
  return wordCount <= 2 || genericPhrases.includes(cleaned);
}

function generateTitleFromResponse(response: string): string {
  // Take the first sentence or first 50 chars of the AI response
  const firstLine = response.split('\n').find(l => l.trim().length > 0) || response;
  // Strip markdown formatting
  const plain = firstLine.replace(/[#*_`>\-]/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= 50) return plain;
  const truncated = plain.substring(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

// GET /api/chat - Load messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    await initDatabase();

    const messages = await getChatMessages(conversationId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error getting chat messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/chat - Clear messages for a conversation
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    await initDatabase();

    await clearChatMessages(conversationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing chat messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/chat - Chat with AI (streaming)
export async function POST(request: NextRequest) {
  let logMeta: Record<string, any> | undefined;
  try {
    const openai = getOpenAI();
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Parse request — FormData (with image) or JSON (text only)
    let message = '';
    let conversationId = '';
    let image: File | null = null;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      message = ((formData.get('message') as string) || '').trim();
      conversationId = (formData.get('conversationId') as string) || '';
      image = formData.get('image') as File | null;
    } else {
      const body = await request.json();
      message = (body.message || '').trim();
      conversationId = body.conversationId || '';
    }

    if (!message && !image) {
      return NextResponse.json({ error: 'Message or image required' }, { status: 400 });
    }

    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is missing');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Convert image to base64 for OpenAI vision
    let imageContent: { type: 'image_url'; image_url: { url: string } } | null = null;
    if (image) {
      const bytes = await image.arrayBuffer();
      const base64 = Buffer.from(bytes).toString('base64');
      const mimeType = image.type || 'image/jpeg';
      imageContent = {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };
    }

    await initDatabase();

    // Save user message text to DB (images are ephemeral, not persisted)
    const savedText = message || '[Sent an image]';
    await saveChatMessage(session.userId, conversationId, 'user', savedText);

    // Load conversation history from DB and fetch context in parallel
    const now = new Date();
    const todayKey = now.toISOString().split('T')[0];
    const currentDateUtcIso = now.toISOString();
    const currentDateUtcLong = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });

    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoKey = twoWeeksAgo.toISOString().split('T')[0];

    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoKey = oneWeekAgo.toISOString().split('T')[0];

    const [dbMessages, userProfile, workouts, todayMeals, mealHistory, macroGoal, userFacts, aiSoul, healthMetrics] = await Promise.all([
      getChatMessages(conversationId, 50),
      getUserById(session.userId),
      getUserWorkouts(session.userId),
      getUserMealsByDate(session.userId, todayKey),
      getUserMealsForDateRange(session.userId, twoWeeksAgoKey, todayKey),
      getMacroGoal(session.userId),
      getUserFacts(session.userId),
      getAiSoul(session.userId),
      getDailyHealthMetrics(session.userId, oneWeekAgoKey, todayKey),
    ]);

    // Auto-generate title from first user message (or defer for generic messages)
    const userMessages = dbMessages.filter(m => m.role === 'user');
    const isFirstMessage = userMessages.length === 1;
    const deferTitle = isFirstMessage && (!message || isGenericMessage(message));
    if (isFirstMessage && !deferTitle) {
      const title = generateTitle(message);
      await updateConversationTitle(session.userId, conversationId, title);
    }

    // Touch conversation updated_at
    await touchConversation(conversationId);

    const userProfileContext = formatUserProfileForContext(userProfile, macroGoal);
    const workoutContext = formatWorkoutsForContext(workouts);
    const mealContext = formatMealsForContext(todayMeals);
    const mealHistoryContext = formatMealHistoryForContext(mealHistory, todayKey);
    const goalContext = formatGoalForContext(macroGoal);
    const factsContext = formatUserFactsForContext(userFacts);
    const healthContext = formatHealthMetricsForContext(healthMetrics);

    // Build chat history — inject image into the last user message if present
    const chatHistory: Array<{ role: 'user' | 'assistant'; content: any }> = dbMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    if (imageContent && chatHistory.length > 0) {
      const lastMsg = chatHistory[chatHistory.length - 1];
      if (lastMsg.role === 'user') {
        const textContent = message || 'What do you see in this image?';
        lastMsg.content = [
          imageContent,
          { type: 'text', text: textContent },
        ];
      }
    }

    logMeta = {
      userId: session.userId,
      conversationId,
      messageCount: chatHistory.length,
      hasImage: !!imageContent,
    };

    // Build personality section — soul overrides default tone if present
    const personalitySection = aiSoul
      ? `\n--- PERSONALITY ---\n${aiSoul.soulContent}\nStay in this personality at ALL times. Every response should reflect this voice and coaching style.\n--- END PERSONALITY ---\n`
      : '';

    const defaultTone = aiSoul
      ? '' // Soul replaces the default tone instruction
      : '\nBe concise, friendly, and helpful. Reference specific workouts, meals, and goals when relevant. If they ask about progress, analyze trends in their data. If they ask about nutrition, factor in their goal type, remaining macros for the day, and recent eating patterns from the meal history. Keep responses focused and practical.\n';

    const systemMessage = `You are a knowledgeable fitness and workout assistant for ${session.name}. You have access to their profile metrics (age, weight, height, sex, activity level), their complete workout history (including workout notes), today's meals, the past 2 weeks of meal history, and their nutrition goals. You can provide advice on training, form, programming, recovery, and nutrition.
${personalitySection}
Current date context: ${currentDateUtcLong} (UTC date key: ${todayKey}, UTC timestamp: ${currentDateUtcIso}). Use this to reason about recency and interpret terms like today, yesterday, and last workout.
Unit rules: bodyweight in the user profile is stored in pounds (lb). Workout exercise loads are stored in kilograms (kg), unless marked as Bodyweight/BW. Keep those units accurate in responses.

User profile:
${userProfileContext}
${factsContext ? `\nPersonal context about this user:\n${factsContext}\nUse these facts to personalize your responses — reference injuries, dietary needs, goals, and preferences naturally.\n` : ''}${userFacts.length < 3 ? `\nYou don't know much about this user yet. When it feels natural (not forced), ask a friendly question to learn about them — their fitness background, injuries, dietary preferences, goals, or lifestyle. Don't ask more than one discovery question per message, and only when contextually appropriate.\n` : ''}
${healthContext}

Here is their complete workout history (progression summary first, then recent workouts in detail, then older workouts in compact format):
${workoutContext}

Today's meals:
${mealContext}

Meal history (past 2 weeks, each line is one day with daily totals and individual meals):
${mealHistoryContext}

${goalContext}
${defaultTone}
Formatting rules: You may use Markdown for structure. Use **bold** for emphasis, headings (##, ###) for sections, bullet points and numbered lists where helpful. Keep formatting clean and not excessive.`;

    const model = 'gpt-5.4';
    logMeta = {
      ...logMeta,
      model,
      systemMessageLength: systemMessage.length,
    };

    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemMessage },
        ...chatHistory,
      ],
      temperature: 0.7,
      stream: true,
    });

    let fullContent = '';

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              controller.enqueue(new TextEncoder().encode(delta));
            }
          }
          // Save complete assistant message to DB after stream finishes
          await saveChatMessage(session.userId, conversationId, 'assistant', fullContent);
          // For generic first messages, generate title from AI response
          if (deferTitle && fullContent.trim()) {
            const title = generateTitleFromResponse(fullContent);
            await updateConversationTitle(session.userId, conversationId, title);
          }
          // Fire-and-forget: extract personality facts from this conversation
          const userMsgCount = dbMessages.filter(m => m.role === 'user').length;
          if (userMsgCount >= 3) {
            runPersonalityAgent(session.userId, conversationId).catch((err) =>
              console.error('Personality agent error:', err)
            );
          }
          controller.close();
        } catch (err) {
          logOpenAIError('chat-stream', err, logMeta);
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Content-Encoding': 'none',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    logOpenAIError('chat', error, logMeta);

    if (error?.code === 'invalid_api_key' || error?.status === 401) {
      return NextResponse.json({ error: 'Invalid OpenAI API key' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 });
  }
}
