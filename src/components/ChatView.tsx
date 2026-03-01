'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Loader2, MessageCircle, Bot, Plus, PanelLeft, Trash2, ImagePlus, X, Sparkles, Shield, Flame, BookOpen, Heart, FlaskConical, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from '@/types/meal';
import { AiSoul, SoulPresetId } from '@/types/user';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Conversation {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

const SUGGESTION_POOL = [
  'How has my progress been this month?',
  'What are my strongest lifts right now?',
  'Am I overtraining any muscle groups?',
  'How does my volume compare week to week?',
  'Suggest a workout split for me',
  'How can I break through my bench plateau?',
  'Should I deload this week?',
  'What accessory work am I missing?',
  'Tips for better recovery between sessions',
  'How much rest should I take between sets?',
  'Am I hitting my protein target consistently?',
  'What should I eat for my next meal?',
  'How are my macros trending this week?',
  'Critique my most recent workout',
  'How can I improve my push day?',
  'What should I focus on in my next leg session?',
  'Compare my pull day to my push day volume',
  'What muscles am I neglecting?',
  'How can I increase my squat?',
  'Rate my nutrition this week',
];

function getRandomSuggestions(count: number = 3): string[] {
  const shuffled = [...SUGGESTION_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

const CACHE_ACTIVE_CONV_KEY = 'workout-ai-active-conversation-id';
const CACHE_SOUL_KEY = 'workout-ai-soul';

const PRESET_ICONS: Record<SoulPresetId, typeof Shield> = {
  drill_sergeant: Shield,
  hype_coach: Flame,
  wise_mentor: BookOpen,
  friendly_trainer: Heart,
  science_nerd: FlaskConical,
};

const SOUL_PRESETS: { id: SoulPresetId; name: string; shortDescription: string }[] = [
  {
    id: 'drill_sergeant',
    name: 'Drill Sergeant',
    shortDescription: 'Tough love, no excuses. Military-style accountability that pushes you to your limits.',
  },
  {
    id: 'hype_coach',
    name: 'Hype Coach',
    shortDescription: 'Maximum energy, maximum hype. Gets excited about every rep and every meal logged.',
  },
  {
    id: 'wise_mentor',
    name: 'Wise Mentor',
    shortDescription: 'Calm, philosophical guidance. Focuses on the long game, habits, and mindset.',
  },
  {
    id: 'friendly_trainer',
    name: 'Friendly Trainer',
    shortDescription: 'Warm, supportive, and approachable. Like a best friend who\'s also a certified PT.',
  },
  {
    id: 'science_nerd',
    name: 'Science Nerd',
    shortDescription: 'Data-driven, evidence-based coaching. Loves percentages, studies, and optimization.',
  },
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
  const [suggestions, setSuggestions] = useState(() => getRandomSuggestions(3));
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [soul, setSoul] = useState<AiSoul | null>(() => {
    try {
      const cached = localStorage.getItem(CACHE_SOUL_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [isLoadingSoul, setIsLoadingSoul] = useState(() => {
    try { return !localStorage.getItem(CACHE_SOUL_KEY); } catch { return true; }
  });
  const [isBuildingSoul, setIsBuildingSoul] = useState(false);
  const [customSoulInput, setCustomSoulInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [soulError, setSoulError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMsgIdRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);
  const isFirstMountRef = useRef(true);

  const { barsHidden: headerHidden } = useScrollDirection({
    enabled: messages.length > 0,
    scrollRef: scrollAreaRef,
    threshold: 10,
    topThreshold: 50,
  });

  const activeTitle = useMemo(() => {
    if (!activeConversationId) return null;
    return conversations.find(c => c.id === activeConversationId)?.title ?? null;
  }, [activeConversationId, conversations]);

  const scrollToBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, []);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Persist activeConversationId to survive remounts
  // Skip initial mount so we don't nuke the saved ID before loadConversations reads it
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    try {
      if (activeConversationId) {
        localStorage.setItem(CACHE_ACTIVE_CONV_KEY, activeConversationId);
      } else {
        localStorage.removeItem(CACHE_ACTIVE_CONV_KEY);
      }
    } catch {}
  }, [activeConversationId]);

  // Load conversations on mount
  useEffect(() => {
    async function loadConversations() {
      // Read persisted active conversation ID
      let savedActiveId: string | null = null;
      try {
        savedActiveId = localStorage.getItem(CACHE_ACTIVE_CONV_KEY);
      } catch {}

      // Show cached data instantly while fetching fresh
      try {
        const cached = localStorage.getItem('workout-ai-conversations');
        if (cached) {
          const rawConvs = JSON.parse(cached);
          const convs = rawConvs.map((c: any) => ({
            ...c,
            created_at: new Date(c.created_at),
            updated_at: new Date(c.updated_at),
          }));
          setConversations(convs);

          if (savedActiveId) {
            const exists = convs.some((c: Conversation) => c.id === savedActiveId);
            if (exists) {
              setActiveConversationId(savedActiveId);
              const cachedMsgs = localStorage.getItem(`workout-ai-chat-msgs-${savedActiveId}`);
              if (cachedMsgs) {
                setMessages(JSON.parse(cachedMsgs).map((m: any) => ({
                  ...m, createdAt: new Date(m.createdAt),
                })));
              }
            }
          }
          setIsLoadingHistory(false);
        }
      } catch {}

      // Fetch fresh from server
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
          try { localStorage.setItem('workout-ai-conversations', JSON.stringify(data.conversations || [])); } catch {}

          if (savedActiveId) {
            const exists = convs.some((c: Conversation) => c.id === savedActiveId);
            if (exists) {
              setActiveConversationId(savedActiveId);
              await loadMessages(savedActiveId);
            } else {
              // Conversation was deleted elsewhere
              setActiveConversationId(null);
              setMessages([]);
              try { localStorage.removeItem(CACHE_ACTIVE_CONV_KEY); } catch {}
            }
          }
          // If savedActiveId is null: stay in new-chat mode
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadConversations();
  }, []);

  // Fetch soul on mount
  useEffect(() => {
    async function fetchSoul() {
      try {
        const res = await fetch('/api/soul');
        if (res.ok) {
          const data = await res.json();
          setSoul(data.soul || null);
          try {
            if (data.soul) {
              localStorage.setItem(CACHE_SOUL_KEY, JSON.stringify(data.soul));
            } else {
              localStorage.removeItem(CACHE_SOUL_KEY);
            }
          } catch {}
        }
      } catch (err) {
        console.error('Failed to fetch soul:', err);
      } finally {
        setIsLoadingSoul(false);
      }
    }
    fetchSoul();
  }, []);

  const handleSelectPreset = async (presetId: SoulPresetId) => {
    setIsBuildingSoul(true);
    setSoulError(null);
    try {
      const res = await fetch('/api/soul', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSoul(data.soul);
        try { localStorage.setItem(CACHE_SOUL_KEY, JSON.stringify(data.soul)); } catch {}
      } else {
        const errData = await res.json();
        setSoulError(errData.error || 'Failed to set personality');
      }
    } catch {
      setSoulError('Failed to set personality');
    } finally {
      setIsBuildingSoul(false);
    }
  };

  const handleCustomSoulSubmit = async () => {
    if (!customSoulInput.trim()) return;
    setIsBuildingSoul(true);
    setSoulError(null);
    try {
      const res = await fetch('/api/soul', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customInput: customSoulInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setSoul(data.soul);
        try { localStorage.setItem(CACHE_SOUL_KEY, JSON.stringify(data.soul)); } catch {}
        setCustomSoulInput('');
        setShowCustomInput(false);
      } else {
        const errData = await res.json();
        setSoulError(errData.error || 'Failed to set personality');
      }
    } catch {
      setSoulError('Failed to set personality');
    } finally {
      setIsBuildingSoul(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    // Show cached messages instantly
    try {
      const cached = localStorage.getItem(`workout-ai-chat-msgs-${conversationId}`);
      if (cached) {
        setMessages(JSON.parse(cached).map((m: any) => ({
          ...m, createdAt: new Date(m.createdAt),
        })));
      }
    } catch {}

    // Fetch fresh
    try {
      const res = await fetch(`/api/chat?conversationId=${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        const msgs = (data.messages || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: new Date(m.created_at),
        }));
        setMessages(msgs);
        try { localStorage.setItem(`workout-ai-chat-msgs-${conversationId}`, JSON.stringify(msgs)); } catch {}
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
        try { localStorage.setItem('workout-ai-conversations', JSON.stringify(data.conversations || [])); } catch {}
      }
    } catch (err) {
      console.error('Failed to refresh conversations:', err);
    }
  };

  const clearImage = useCallback(() => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [imagePreviewUrl]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      setSelectedImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // Instant local state reset — no API call, no lag, no duplicates
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setInput('');
    setError(null);
    setShowSidebar(false);
    setSuggestions(getRandomSuggestions(3));
    clearImage();
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [clearImage]);

  const handleSelectConversation = async (conv: Conversation) => {
    if (conv.id === activeConversationId) {
      setShowSidebar(false);
      return;
    }
    setActiveConversationId(conv.id);
    // Show cached messages instantly, or clear if no cache
    try {
      const cached = localStorage.getItem(`workout-ai-chat-msgs-${conv.id}`);
      setMessages(cached ? JSON.parse(cached).map((m: any) => ({ ...m, createdAt: new Date(m.createdAt) })) : []);
    } catch {
      setMessages([]);
    }
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
        try { localStorage.removeItem(`workout-ai-chat-msgs-${convId}`); } catch {}
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

  const handleSubmit = async (e?: React.FormEvent, overrideMessage?: string) => {
    e?.preventDefault();
    const trimmed = (overrideMessage ?? input).trim();
    const hasImage = !!selectedImage;
    if ((!trimmed && !hasImage) || isLoading || isStreaming || isSubmittingRef.current) return;

    // Capture image before clearing state
    const imageToSend = selectedImage;

    // Ref-based lock to prevent race conditions (state updates are async)
    isSubmittingRef.current = true;

    // Immediately lock UI to prevent double-submit
    setInput('');
    clearImage();
    setIsLoading(true);
    setError(null);

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const displayContent = trimmed || (hasImage ? '[Sent an image]' : '');
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: displayContent,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);

    // Auto-create conversation if none exists (lazy creation)
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
          setIsLoading(false);
          return;
        }
      } catch {
        setError('Failed to create conversation');
        setIsLoading(false);
        return;
      }
    }

    const assistantMsgId = crypto.randomUUID();
    streamingMsgIdRef.current = assistantMsgId;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let fetchOptions: RequestInit;
      if (imageToSend) {
        const formData = new FormData();
        formData.append('message', trimmed);
        formData.append('conversationId', convId!);
        formData.append('image', imageToSend);
        fetchOptions = { method: 'POST', body: formData, signal: abortController.signal };
      } else {
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed, conversationId: convId }),
          signal: abortController.signal,
        };
      }

      const res = await fetch('/api/chat', fetchOptions);

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

      // Cache messages after streaming
      setMessages(prev => {
        try { localStorage.setItem(`workout-ai-chat-msgs-${convId}`, JSON.stringify(prev)); } catch {}
        return prev;
      });

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
      isSubmittingRef.current = false;
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
    handleSubmit(undefined, suggestion);
  };

  // Filter out legacy empty "New Chat" conversations from sidebar
  const displayConversations = conversations.filter((c) => c.title !== 'New Chat');

  return (
    <div className="flex flex-col h-full animate-fade-in-blur">
      {/* Header */}
      <div className={`flex items-center justify-between pb-3 border-b mb-3 shrink-0 transition-all duration-300 ease-in-out ${
        headerHidden ? '-mt-14 opacity-0 pointer-events-none' : 'mt-0 opacity-100'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSidebar(true)}
            className="h-9 w-9 p-0 rounded-lg shrink-0"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          {activeTitle ? (
            <h3 className="text-sm font-semibold truncate">{activeTitle}</h3>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold leading-none">{soul ? soul.name : 'Workout Assistant'}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{soul ? 'Your AI coach' : 'AI-powered fitness coach'}</p>
              </div>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNewChat}
          className="h-9 w-9 p-0 rounded-lg shrink-0"
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
          !soul && !isLoadingSoul && !activeConversationId ? (
            /* Personality Picker — shown when no soul is set and no active conversation */
            <div className="flex flex-col items-center py-6 px-2 animate-slide-up">
              {isBuildingSoul ? (
                <div className="flex flex-col items-center justify-center py-16 animate-fade-in-blur">
                  <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                    <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                  </div>
                  <h3 className="text-base font-semibold mb-1.5">Building your AI coach...</h3>
                  <p className="text-muted-foreground text-xs text-center max-w-xs">
                    Crafting a unique personality just for you. This takes a few seconds.
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-3 animate-scale-in">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold mb-1 animate-slide-up animation-delay-150">
                    Choose your AI coach
                  </h3>
                  <p className="text-muted-foreground text-xs text-center max-w-xs mb-5 animate-slide-up animation-delay-300">
                    Pick a personality that matches your vibe. You can always change it later.
                  </p>

                  {soulError && (
                    <div className="mb-3 p-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive w-full max-w-sm">
                      {soulError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm animate-slide-up animation-delay-300">
                    {SOUL_PRESETS.map((preset) => {
                      const Icon = PRESET_ICONS[preset.id];
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleSelectPreset(preset.id)}
                          className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-border bg-background hover:bg-secondary/80 hover:border-primary/30 transition-all text-left group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{preset.name}</p>
                            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                              {preset.shortDescription}
                            </p>
                          </div>
                        </button>
                      );
                    })}

                    {/* Custom option */}
                    <button
                      onClick={() => setShowCustomInput(true)}
                      className="flex flex-col items-start gap-1.5 p-3 rounded-xl border border-dashed border-border bg-background hover:bg-secondary/80 hover:border-primary/30 transition-all text-left group col-span-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <Pencil className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">Describe your own</p>
                          <p className="text-[11px] text-muted-foreground">Tell us what kind of coach you want</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Custom input area */}
                  {showCustomInput && (
                    <div className="mt-3 w-full max-w-sm animate-slide-up space-y-2">
                      <textarea
                        value={customSoulInput}
                        onChange={(e) => setCustomSoulInput(e.target.value)}
                        placeholder="Describe your ideal AI coach... (e.g., 'A chill surfer dude who's really into functional fitness and clean eating')"
                        rows={3}
                        className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setShowCustomInput(false); setCustomSoulInput(''); }}
                          className="flex-1 h-9 text-xs rounded-lg"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleCustomSoulSubmit}
                          disabled={!customSoulInput.trim()}
                          className="flex-1 h-9 text-xs rounded-lg"
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Create
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Normal empty state — soul exists or viewing an existing conversation */
            <div className="flex flex-col items-center justify-center py-12 animate-slide-up">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 animate-scale-in animation-delay-150">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-1.5 animate-slide-up animation-delay-300">
                How can I help?
              </h3>
              <p className="text-muted-foreground text-xs px-6 max-w-xs mx-auto text-center animate-slide-up animation-delay-500">
                {soul ? `Your ${soul.name} is ready. Ask anything about workouts, nutrition, or training.` : 'Ask about your workouts, nutrition, or training goals. I have context of your recent sessions.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 justify-center px-4 animate-slide-up animation-delay-500">
                {suggestions.map((suggestion) => (
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
          )
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

      {/* Hidden file input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* Input Area */}
      <div className="border-t pt-3 shrink-0">
        {/* Image preview */}
        {imagePreviewUrl && (
          <div className="mb-2 inline-flex items-start gap-1.5">
            <div className="relative">
              <img
                src={imagePreviewUrl}
                alt="Attached"
                className="h-16 w-16 rounded-lg object-cover border border-border"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={isLoading || isStreaming}
            className="h-11 w-11 p-0 rounded-xl shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="h-5 w-5" />
          </Button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={selectedImage ? 'Add a message or send the image...' : 'Ask about your workouts...'}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-all"
            disabled={isLoading || isStreaming}
          />
          <Button
            type="submit"
            size="sm"
            disabled={(!input.trim() && !selectedImage) || isLoading || isStreaming}
            className="h-11 w-11 p-0 rounded-xl interactive-scale shrink-0"
          >
            {isLoading || isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>

      {/* Sidebar Sheet */}
      <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-3 border-b shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-semibold">Conversations</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNewChat}
                className="h-7 w-7 p-0"
                title="New Chat"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            {displayConversations.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-xs text-muted-foreground">No conversations yet</p>
              </div>
            ) : (
              <div className="p-2 space-y-0.5">
                {displayConversations.map((conv) => (
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
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
