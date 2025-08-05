'use client';

import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { ChevronDown, Clock, Dumbbell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExerciseCache } from '@/hooks/useExerciseCache';

interface AutocompleteSuggestion {
  name: string;
  lastWeight?: string | null;
  lastSets?: number | null;
  lastReps?: number | null;
  lastEffectiveRepsMax?: number | null;
  lastEffectiveRepsTarget?: number | null;
  useEffectiveReps?: boolean;
  usageCount: number;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: AutocompleteSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Autocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Exercise name",
  className,
  disabled = false,
}: AutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isSelectingRef = useRef(false);

  // Use the exercise cache hook
  const { searchExercises, isCacheReady, isLoading: cacheLoading } = useExerciseCache();

  // Local search using cached data
  const searchLocal = (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }

    const results = searchExercises(query, 8);
    setSuggestions(results);
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // Skip search if we're in the middle of a selection
      if (isSelectingRef.current) {
        return;
      }
      
      if (value && value.trim().length > 0) {
        searchLocal(value.trim());
        setIsOpen(true);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 100); // Reduced debounce since we're searching locally

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, searchExercises]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);
    // Reset selection flag when user manually types
    isSelectingRef.current = false;
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          selectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle suggestion selection
  const selectSuggestion = (suggestion: AutocompleteSuggestion) => {
    // Set flag to prevent searches during selection process
    isSelectingRef.current = true;
    
    onChange(suggestion.name);
    onSelect?.(suggestion);
    setIsOpen(false);
    setSelectedIndex(-1);
    setSuggestions([]);
    
    // Industry standard: blur input immediately after selection
    inputRef.current?.blur();
    
    // Reset flag after selection process completes
    setTimeout(() => {
      isSelectingRef.current = false;
    }, 200);
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format last used data display
  const formatLastUsed = (suggestion: AutocompleteSuggestion) => {
    if (!suggestion.lastWeight && !suggestion.lastSets && !suggestion.lastReps && 
        !suggestion.lastEffectiveRepsMax && !suggestion.lastEffectiveRepsTarget) {
      return null;
    }

    const weight = suggestion.lastWeight === 'BW' ? 'BW' : 
                  suggestion.lastWeight ? `${suggestion.lastWeight}kg` : '';
    
    if (suggestion.useEffectiveReps) {
      const max = suggestion.lastEffectiveRepsMax || '?';
      const target = suggestion.lastEffectiveRepsTarget || '?';
      return `${weight} - ${max}/${target} ER`.trim();
    } else {
      const sets = suggestion.lastSets || '?';
      const reps = suggestion.lastReps || '?';
      return `${weight} - ${sets}x${reps}`.trim();
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value && suggestions.length > 0 && !isSelectingRef.current) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full px-4 py-3 text-base border rounded-lg bg-background",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "transition-all duration-200 hover:border-border/70",
            "pr-10", // Space for loading indicator
            className
          )}
        />
        
        {/* Loading indicator or dropdown arrow */}
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          {cacheLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
          ) : (
            <ChevronDown className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isOpen && suggestions.length > 0 && "rotate-180"
            )} />
          )}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => {
            const lastUsed = formatLastUsed(suggestion);
            
            return (
              <div
                key={`${suggestion.name}-${index}`}
                className={cn(
                  "px-4 py-3 cursor-pointer transition-colors duration-150",
                  "hover:bg-muted/50 border-b border-border/30 last:border-b-0",
                  selectedIndex === index && "bg-muted/50"
                )}
                onClick={() => selectSuggestion(suggestion)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Dumbbell className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {suggestion.name}
                      </div>
                      {lastUsed && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="truncate">Last: {lastUsed}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {suggestion.usageCount > 1 && (
                    <div className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                      {suggestion.usageCount}x
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}