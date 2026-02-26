'use client';

import { PaletteEntry, WORKOUT_COLOR_PALETTE } from '@/lib/calendarColors';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RotateCcw } from 'lucide-react';

interface CalendarLegendProps {
  categories: string[];
  getColor: (name: string) => PaletteEntry;
  overrides: Record<string, number>;
  onSetColor: (name: string, paletteIndex: number) => void;
  onResetColor: (name: string) => void;
  open: boolean;
  onClose: () => void;
}

export function CalendarLegend({
  categories,
  getColor,
  overrides,
  onSetColor,
  onResetColor,
  open,
  onClose,
}: CalendarLegendProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Workout Colours</SheetTitle>
          <SheetDescription>Tap a colour to change how workouts appear on the calendar</SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4 pb-6">
          {categories.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No workouts logged yet</p>
            </div>
          ) : (
            <div className="space-y-3 stagger-children">
              {categories.map((name) => {
                const color = getColor(name);
                const hasOverride = overrides[name] !== undefined;

                return (
                  <div
                    key={name}
                    className="p-3 rounded-xl border border-border/50 bg-card/50 space-y-2.5"
                  >
                    {/* Name row */}
                    <div className="flex items-center gap-2.5">
                      <div className={cn('w-4 h-4 rounded-full shrink-0', color.dot)} />
                      <span className="text-sm font-medium capitalize flex-1 truncate">
                        {name}
                      </span>
                      {hasOverride && (
                        <button
                          onClick={() => onResetColor(name)}
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                          title="Reset to auto"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Colour picker row */}
                    <div className="flex flex-wrap gap-2 pl-6.5">
                      {WORKOUT_COLOR_PALETTE.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => onSetColor(name, i)}
                          className={cn(
                            'w-6 h-6 rounded-full transition-all duration-150',
                            c.dot,
                            color.hex === c.hex
                              ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/50 scale-110'
                              : 'opacity-50 hover:opacity-80 hover:scale-110'
                          )}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
