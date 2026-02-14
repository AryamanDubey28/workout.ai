'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageCircle, Bot, Plus, PanelLeft, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/types/meal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Conversation {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

const STARTER_SUGGESTIONS = [
  'How has my progress been?',
  'Suggest a workout split',
  'Tips for better recovery',
  'How can I improve my push day strength?',
  'Critique my leg workouts',
];

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load conversations on mount
  useEffect(() => {
    async function loadConversations() {
      try {
        const res = await fetch('/api/chat/conversations');
        if (res.ok) {
          const data = await res.json();
          const convs = (data.conversations || []).map((c: any) => ({
            ...c,
            created_at: new Date(c.created_at),
            updated_at: new Date(c.updated_at),
          }));
          setConversations(convs);

          // Load most recent conversation's messages
          if (convs.length > 0) {
            const mostRecent = convs[0];
            setActiveConversationId(mostRecent.id);
            await loadMessages(mostRecent.id);
          }
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadConversations();
  }, []);

  const loadMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`/api/chat?conversationId=${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(
          (data.messages || []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: new Date(m.created_at),
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const refreshConversations = async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(
          (data.conversations || []).map((c: any) => ({
            ...c,
            created_at: new Date(c.created_at),
            updated_at: new Date(c.updated_at),
          }))
        );
      }
    } catch (err) {
      console.error('Failed to refresh conversations:', err);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const conv: Conversation = {
          ...data.conversation,
          created_at: new Date(data.conversation.created_at),
          updated_at: new Date(data.conversation.updated_at),
        };
        setConversations((prev) => [conv, ...prev]);
        setActiveConversationId(conv.id);
        setMessages([]);
        setError(null);
        setShowSidebar(false);
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
  };

  const handleSelectConversation = async (conv: Conversation) => {
    if (conv.id === activeConversationId) {
      setShowSidebar(false);
      return;
    }
    setActiveConversationId(conv.id);
    setMessages([]);
    setError(null);
    setShowSidebar(false);
    await loadMessages(conv.id);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/chat/conversations/${convId}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== convId));
        if (activeConversationId === convId) {
          // Switch to next conversation or clear
          const remaining = conversations.filter((c) => c.id !== convId);
          if (remaining.length > 0) {
            setActiveConversationId(remaining[0].id);
            await loadMessages(remaining[0].id);
          } else {
            setActiveConversationId(null);
            setMessages([]);
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading || isStreaming) return;

    // Auto-create conversation if none exists
    let convId = activeConversationId;
    if (!convId) {
      try {
        const res = await fetch('/api/chat/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          const conv: Conversation = {
            ...data.conversation,
            created_at: new Date(data.conversation.created_at),
            updated_at: new Date(data.conversation.updated_at),
          };
          convId = conv.id;
          setActiveConversationId(conv.id);
          setConversations((prev) => [conv, ...prev]);
        } else {
          setError('Failed to create conversation');
          return;
        }
      } catch {
        setError('Failed to create conversation');
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      createdAt: new Date(),
    };

    const assistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = assistantMsgId;

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversationId: convId }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to get response');
      }

      setIsLoading(false);
      setIsStreaming(true);

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          createdAt: new Date(),
        },
      ]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: m.content + text } : m
          )
        );
      }

      // Refresh conversations to pick up auto-generated title
      refreshConversations();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Chat error:', err);
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      streamingMsgIdRef.current = null;
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full animate-fade-in-blur relative">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(true)}
            className="h-9 w-9 p-0 rounded-lg"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-none">Workout Assistant</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">AI-powered fitness coach</p>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewChat}
          className="h-9 w-9 p-0 rounded-lg"
          title="New Chat"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto min-h-0 pb-4 space-y-1"
      >
        {isLoadingHistory ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 animate-slide-up">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 animate-scale-in animation-delay-150">
              <MessageCircle className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-base font-semibold mb-1.5 animate-slide-up animation-delay-300">
              How can I help?
            </h3>
            <p className="text-muted-foreground text-xs px-6 max-w-xs mx-auto text-center animate-slide-up animation-delay-500">
              Ask about your workouts, nutrition, or training goals. I have context of your recent sessions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center px-4 animate-slide-up animation-delay-500">
              {STARTER_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-secondary transition-colors interactive-scale"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === 'user' ? (
                  <div className="flex justify-end mb-3">
                    <div className="max-w-[85%]">
                      <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm bg-primary text-primary-foreground">
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-start mb-4">
                    <div className="max-w-[90%] flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="rounded-2xl rounded-tl-md px-4 py-2.5 text-sm bg-secondary text-secondary-foreground">
                        <div className="chat-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                          {isStreaming && msg.id === streamingMsgIdRef.current && (
                            <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom rounded-sm opacity-70" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="max-w-[90%] flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="bg-secondary rounded-2xl rounded-tl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <div
                        className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-2 p-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive animate-slide-up shrink-0">
          {error}
        </div>
      )}

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t pt-3 shrink-0"
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your workouts..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
          disabled={isLoading || isStreaming}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!input.trim() || isLoading || isStreaming}
          className="h-10 w-10 p-0 rounded-xl interactive-scale shrink-0"
        >
          {isLoading || isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>

      {/* Sidebar Overlay */}
      {showSidebar && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 z-40 animate-backdrop-in"
            onClick={() => setShowSidebar(false)}
          />
          {/* Sidebar Panel */}
          <div className="absolute inset-y-0 left-0 w-72 bg-background border-r z-50 flex flex-col animate-slide-right shadow-xl">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between p-3 border-b shrink-0">
              <h4 className="text-sm font-semibold">Conversations</h4>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  className="h-7 w-7 p-0"
                  title="New Chat"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSidebar(false)}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <p className="text-xs text-muted-foreground">No conversations yet</p>
                </div>
              ) : (
                <div className="p-2 space-y-0.5">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm ${
                        conv.id === activeConversationId
                          ? 'bg-secondary text-secondary-foreground'
                          : 'hover:bg-secondary/50 text-foreground'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{conv.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatRelativeDate(conv.updated_at)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
