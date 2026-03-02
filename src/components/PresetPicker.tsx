'use client';

import { WorkoutPreset } from '@/types/workout';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Dumbbell, Footprints } from 'lucide-react';

interface PresetPickerProps {
  presets: WorkoutPreset[];
  isLoading: boolean;
  isOpen: boolean;
  onSelect: (preset: WorkoutPreset) => void;
  onClose: () => void;
}

export function PresetPicker({
  presets,
  isLoading,
  isOpen,
  onSelect,
  onClose,
}: PresetPickerProps) {
  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[60dvh]" aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            Load Preset
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-6 space-y-2 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : presets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No presets yet. Create presets from your profile settings.
            </p>
          ) : (
            presets.map((preset) => {
              const isRun = preset.type === 'run';
              const exerciseNames = preset.exercises
                .map((e) => e.name)
                .filter(Boolean)
                .slice(0, 4);
              return (
                <button
                  key={preset.id}
                  onClick={() => onSelect(preset)}
                  className="w-full text-left p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {isRun ? (
                      <Footprints className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                      <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />
                    )}
                    {preset.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {isRun ? (
                      <>
                        {preset.runData?.distanceKm
                          ? `${preset.runData.distanceKm} km`
                          : 'Run'}
                        {preset.runData?.durationSeconds
                          ? ` — ${Math.floor(preset.runData.durationSeconds / 60)}min`
                          : ''}
                      </>
                    ) : (
                      <>
                        {preset.exercises.length} exercise
                        {preset.exercises.length !== 1 ? 's' : ''}
                        {exerciseNames.length > 0 && (
                          <span>
                            {' '}
                            — {exerciseNames.join(', ')}
                            {preset.exercises.length > 4 && '...'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
