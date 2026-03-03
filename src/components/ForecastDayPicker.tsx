'use client';

import { ForecastDay, WorkoutPreset } from '@/types/workout';
import { PaletteEntry } from '@/lib/calendarColors';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Dumbbell, Footprints, Moon, RotateCcw, Check } from 'lucide-react';

interface ForecastDayPickerProps {
  day: ForecastDay | null;
  presets: WorkoutPreset[];
  getColor: (name: string) => PaletteEntry;
  open: boolean;
  onClose: () => void;
  onSelect: (date: string, presetId: string | null) => void;
  onReset: (date: string) => void;
}

function formatDateHeader(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function ForecastDayPicker({
  day,
  presets,
  getColor,
  open,
  onClose,
  onSelect,
  onReset,
}: ForecastDayPickerProps) {
  const isRest = day?.presetId === null;
  const currentLabel = day
    ? isRest
      ? 'Rest Day'
      : day.presetName || 'Workout'
    : '';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>
            {day ? formatDateHeader(day.date) : ''}
          </SheetTitle>
          <SheetDescription>
            Currently: {currentLabel}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-6">
          {/* Reset to default button */}
          {day?.isOverride && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full mb-3 text-muted-foreground"
              onClick={() => {
                onReset(day.date);
                onClose();
              }}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-2" />
              Reset to cycle default
            </Button>
          )}

          {/* Preset list */}
          <div className="space-y-2">
            {presets.map((preset) => {
              const isRun = preset.type === 'run';
              const color = getColor(preset.name);
              const isSelected = day?.presetId === preset.id;
              const exerciseNames = preset.exercises
                .map((e) => e.name)
                .filter(Boolean)
                .slice(0, 4);

              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    if (day) {
                      onSelect(day.date, preset.id);
                      onClose();
                    }
                  }}
                  className={cn(
                    'w-full text-left p-3 rounded-xl border transition-colors',
                    isSelected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/50 hover:border-primary/30 hover:bg-primary/5',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn('w-3 h-3 rounded-full shrink-0', color.dot)} />
                    <div className="flex-1 min-w-0">
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
                                {' '} — {exerciseNames.join(', ')}
                                {preset.exercises.length > 4 && '...'}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-border/50 my-3" />

          {/* Rest day option */}
          <button
            onClick={() => {
              if (day) {
                onSelect(day.date, null);
                onClose();
              }
            }}
            className={cn(
              'w-full text-left p-3 rounded-xl border transition-colors',
              isRest
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/50 hover:border-primary/30 hover:bg-primary/5',
            )}
          >
            <div className="flex items-center gap-2">
              <Moon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              <span className="font-medium text-sm">Rest Day</span>
              {isRest && (
                <Check className="h-4 w-4 text-primary shrink-0 ml-auto" />
              )}
            </div>
          </button>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
