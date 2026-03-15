import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import {
  initDatabase,
  saveChatMessage,
  touchConversation,
  updateConversationTitle,
} from '@/lib/db';
import { runPersonalityAgent } from '@/lib/agents/personalityAgent';

// POST /api/chat/voice-messages — Bulk save voice transcript messages
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { conversationId, messages } = await request.json();

    if (!conversationId || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'conversationId and messages[] are required' },
        { status: 400 },
      );
    }

    await initDatabase();

    // Save all messages sequentially to preserve order
    for (const msg of messages) {
      if (msg.role && msg.content) {
        await saveChatMessage(
          session.userId,
          conversationId,
          msg.role,
          msg.content,
        );
      }
    }

    // Auto-generate title from first user message
    const firstUserMsg = messages.find(
      (m: { role: string }) => m.role === 'user',
    );
    if (firstUserMsg?.content) {
      const title =
        firstUserMsg.content.length > 50
          ? firstUserMsg.content.substring(0, 47) + '...'
          : firstUserMsg.content;
      await updateConversationTitle(session.userId, conversationId, title);
    }

    await touchConversation(conversationId);

    // Run personality extraction if enough user messages (fire-and-forget)
    const userMsgCount = messages.filter(
      (m: { role: string }) => m.role === 'user',
    ).length;
    if (userMsgCount >= 3) {
      runPersonalityAgent(session.userId, conversationId).catch((err) =>
        console.error('Voice personality agent error:', err),
      );
    }

    return NextResponse.json({ success: true, saved: messages.length });
  } catch (error) {
    console.error('Error saving voice messages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
