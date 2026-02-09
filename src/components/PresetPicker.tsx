'use client';

import { WorkoutPreset } from '@/types/workout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Dumbbell, Loader2 } from 'lucide-react';

interface PresetPickerProps {
  presets: WorkoutPreset[];
  isLoading: boolean;
  isOpen: boolean;
  onSelect: (preset: WorkoutPreset) => void;
  onClose: () => void;
}

export function PresetPicker({ presets, isLoading, isOpen, onSelect, onClose }: PresetPickerProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-backdrop-in"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-sm mx-auto animate-modal-in border-border/50 shadow-2xl shadow-black/25"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary" />
              Load Preset
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : presets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No presets yet. Create presets from your profile settings.
            </p>
          ) : (
            presets.map((preset) => {
              const exerciseNames = preset.exercises
                .map((e) => e.name)
                .filter(Boolean)
                .slice(0, 4);
              return (
                <button
                  key={preset.id}
                  onClick={() => onSelect(preset)}
                  className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-200 group"
                >
                  <div className="font-medium group-hover:text-primary transition-colors">
                    {preset.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {preset.exercises.length} exercise{preset.exercises.length !== 1 ? 's' : ''}
                    {exerciseNames.length > 0 && (
                      <span> — {exerciseNames.join(', ')}{preset.exercises.length > 4 && '...'}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
