'use client';

import { Dumbbell, UtensilsCrossed, MessageCircle } from 'lucide-react';

export type TabId = 'workouts' | 'meals' | 'chat';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  hidden?: boolean;
}

const tabs: { id: TabId; label: string; icon: typeof Dumbbell }[] = [
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'meals', label: 'Meals', icon: UtensilsCrossed },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
];

export function BottomNav({ activeTab, onTabChange, hidden = false }: BottomNavProps) {
  return (
    <nav className={`fixed bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg safe-area-bottom transition-transform duration-300 ease-in-out ${
      hidden ? 'translate-y-full' : 'translate-y-0'
    }`}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all duration-200 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-transform duration-200 ${
                  isActive ? 'scale-110' : ''
                }`}
              />
              <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>
                {label}
              </span>
              {isActive && (
                <div className="absolute bottom-1 w-8 h-0.5 bg-primary rounded-full animate-scale-in" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
