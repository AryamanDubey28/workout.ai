'use client';

import { Exercise } from '@/types/workout';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Autocomplete } from '@/components/ui/autocomplete';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Trash2, ChevronDown, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ExerciseRowProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
  onDelete: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

function formatCompactSummary(exercise: Exercise): string {
  if (exercise.useEffectiveReps) {
    return `${exercise.effectiveRepsMax || '?'}/${exercise.effectiveRepsTarget || '?'} ER`;
  }
  if (exercise.repsPerSet && exercise.repsPerSet.length > 0) {
    const allSame = exercise.repsPerSet.every(r => r === exercise.repsPerSet![0]);
    if (allSame) return `${exercise.repsPerSet.length}×${exercise.repsPerSet[0]}`;
    return exercise.repsPerSet.join(',');
  }
  if (exercise.sets && exercise.reps) {
    return `${exercise.sets}×${exercise.reps}`;
  }
  return '';
}

// --- Weight Inputs ---

interface WeightInputsProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
}

function WeightInputs({ exercise, onChange }: WeightInputsProps) {
  const hasMultipleSets = exercise.sets && exercise.sets > 1;
  const isUsingPerSetWeights = exercise.weightsPerSet && exercise.weightsPerSet.length > 0;

  const handleGeneralWeightChange = (weight: string | 'BW') => {
    if (!hasMultipleSets || !isUsingPerSetWeights) {
      onChange({ ...exercise, weight });
      return;
    }
    const newWeightsPerSet = new Array(exercise.sets).fill(weight);
    onChange({ ...exercise, weight, weightsPerSet: newWeightsPerSet });
  };

  const handleWeightForSetChange = (setIndex: number, weight: string | 'BW') => {
    const newWeightsPerSet = [...(exercise.weightsPerSet || [])];
    newWeightsPerSet[setIndex] = weight;
    onChange({ ...exercise, weightsPerSet: newWeightsPerSet });
  };

  const enablePerSetWeights = () => {
    if (!exercise.sets || exercise.sets < 1) return;
    const newWeightsPerSet = new Array(exercise.sets).fill(exercise.weight || '');
    onChange({ ...exercise, weightsPerSet: newWeightsPerSet });
  };

  const disablePerSetWeights = () => {
    const generalWeight = exercise.weightsPerSet?.[0] || exercise.weight || '';
    onChange({ ...exercise, weight: generalWeight, weightsPerSet: undefined });
  };

  // Simple weight input (no sets or single set)
  if (!hasMultipleSets) {
    return (
      <div className="flex gap-2 items-center">
        <Button
          type="button"
          variant={exercise.weight === 'BW' ? 'default' : 'outline'}
          onClick={() => handleGeneralWeightChange(exercise.weight === 'BW' ? '' : 'BW')}
          className="px-3 py-2 text-sm font-medium shrink-0 h-10 min-w-[44px]"
        >
          BW
        </Button>
        {exercise.weight !== 'BW' && (
          <input
            type="text"
            placeholder="Weight (kg)"
            value={exercise.weight || ''}
            onChange={(e) => handleGeneralWeightChange(e.target.value)}
            className="flex-1 px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
          />
        )}
      </div>
    );
  }

  // Multi-set: general weight + toggle for per-set
  if (!isUsingPerSetWeights) {
    return (
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <Button
            type="button"
            variant={exercise.weight === 'BW' ? 'default' : 'outline'}
            onClick={() => handleGeneralWeightChange(exercise.weight === 'BW' ? '' : 'BW')}
            className="px-3 py-2 text-sm font-medium shrink-0 h-10 min-w-[44px]"
          >
            BW
          </Button>
          {exercise.weight !== 'BW' && (
            <input
              type="text"
              placeholder="Weight (kg)"
              value={exercise.weight || ''}
              onChange={(e) => handleGeneralWeightChange(e.target.value)}
              className="flex-1 px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
            />
          )}
        </div>
        <button
          type="button"
          onClick={enablePerSetWeights}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          Different weights per set?
        </button>
      </div>
    );
  }

  // Per-set weight inputs — horizontal scroll (Bug #4 fix)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Weight per set</span>
        <button
          type="button"
          onClick={disablePerSetWeights}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Same weight
        </button>
      </div>
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-2 min-w-min">
          {Array.from({ length: exercise.sets || 0 }, (_, index) => (
            <div key={index} className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-muted-foreground shrink-0 w-3 text-right">{index + 1}</span>
              <Button
                type="button"
                variant={exercise.weightsPerSet?.[index] === 'BW' ? 'default' : 'outline'}
                onClick={() => handleWeightForSetChange(index, exercise.weightsPerSet?.[index] === 'BW' ? '' : 'BW')}
                className="px-1.5 py-0.5 text-[10px] h-7 min-w-[30px]"
              >
                BW
              </Button>
              {exercise.weightsPerSet?.[index] !== 'BW' && (
                <input
                  type="text"
                  placeholder="kg"
                  value={exercise.weightsPerSet?.[index] || ''}
                  onChange={(e) => handleWeightForSetChange(index, e.target.value)}
                  className="w-14 px-2 py-1 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-8 text-center transition-colors"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Sets & Reps Inputs ---

interface SetsAndRepsInputsProps {
  exercise: Exercise;
  onChange: (exercise: Exercise) => void;
}

function SetsAndRepsInputs({ exercise, onChange }: SetsAndRepsInputsProps) {
  const handleSetsChange = (newSets: number | undefined) => {
    if (!newSets || newSets < 1) {
      onChange({ ...exercise, sets: undefined, reps: undefined, repsPerSet: undefined, weightsPerSet: undefined });
      return;
    }

    const currentRepsPerSet = exercise.repsPerSet || [];
    const newRepsPerSet: number[] = [];
    for (let i = 0; i < newSets; i++) {
      newRepsPerSet[i] = currentRepsPerSet[i] || exercise.reps || 0;
    }

    let newWeightsPerSet: (string | 'BW')[] | undefined = undefined;
    if (exercise.weightsPerSet && exercise.weightsPerSet.length > 0) {
      newWeightsPerSet = [];
      for (let i = 0; i < newSets; i++) {
        newWeightsPerSet[i] = exercise.weightsPerSet[i] || exercise.weight || '';
      }
    }

    onChange({ ...exercise, sets: newSets, repsPerSet: newRepsPerSet, weightsPerSet: newWeightsPerSet, reps: exercise.reps });
  };

  const handleRepsForSetChange = (setIndex: number, reps: number | undefined) => {
    const newRepsPerSet = [...(exercise.repsPerSet || [])];
    newRepsPerSet[setIndex] = reps || 0;
    onChange({ ...exercise, repsPerSet: newRepsPerSet });
  };

  const handleGeneralRepsChange = (reps: number | undefined) => {
    if (!exercise.sets || exercise.sets < 1) {
      onChange({ ...exercise, reps });
      return;
    }
    const newRepsPerSet = new Array(exercise.sets).fill(reps || 0);
    onChange({ ...exercise, reps, repsPerSet: newRepsPerSet });
  };

  // No sets defined — simple two-input layout
  if (!exercise.sets || exercise.sets < 1) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <input
            type="number"
            placeholder="Sets"
            value={exercise.sets || ''}
            onChange={(e) => handleSetsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
          />
          <span className="text-xs text-muted-foreground mt-1 block px-0.5">Sets</span>
        </div>
        <div>
          <input
            type="number"
            placeholder="Reps"
            value={exercise.reps || ''}
            onChange={(e) => handleGeneralRepsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
          />
          <span className="text-xs text-muted-foreground mt-1 block px-0.5">Reps</span>
        </div>
      </div>
    );
  }

  // Expanded: sets input + quick fill + per-set reps
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <input
            type="number"
            placeholder="Sets"
            value={exercise.sets || ''}
            onChange={(e) => handleSetsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
          />
          <span className="text-xs text-muted-foreground mt-1 block px-0.5">Sets</span>
        </div>
        <div>
          <input
            type="number"
            placeholder="Fill all"
            value={exercise.reps || ''}
            onChange={(e) => handleGeneralRepsChange(parseInt(e.target.value) || undefined)}
            className="w-full px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
          />
          <span className="text-xs text-muted-foreground mt-1 block px-0.5">Quick fill</span>
        </div>
      </div>

      <div>
        <span className="text-xs text-muted-foreground mb-1.5 block">Reps per set</span>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {Array.from({ length: exercise.sets }, (_, index) => (
            <div key={index}>
              <input
                type="number"
                placeholder="0"
                value={exercise.repsPerSet?.[index] || ''}
                onChange={(e) => handleRepsForSetChange(index, parseInt(e.target.value) || undefined)}
                className="w-full px-2 py-1.5 text-base border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 text-center transition-colors"
              />
              <span className="text-[11px] text-muted-foreground text-center block mt-0.5">Set {index + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main ExerciseRow ---

export function ExerciseRow({ exercise, onChange, onDelete, isExpanded = false, onToggleExpand }: ExerciseRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: exercise.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleInputChange = (field: keyof Exercise, value: any) => {
    onChange({ ...exercise, [field]: value });
  };

  const handleExerciseSelect = (suggestion: any) => {
    const updatedExercise: Exercise = {
      ...exercise,
      name: suggestion.name,
    };

    if (suggestion.lastWeight) {
      updatedExercise.weight = suggestion.lastWeight;
    }

    if (suggestion.useEffectiveReps !== undefined) {
      updatedExercise.useEffectiveReps = suggestion.useEffectiveReps;
      if (suggestion.useEffectiveReps) {
        if (suggestion.lastEffectiveRepsMax) updatedExercise.effectiveRepsMax = suggestion.lastEffectiveRepsMax;
        if (suggestion.lastEffectiveRepsTarget) updatedExercise.effectiveRepsTarget = suggestion.lastEffectiveRepsTarget;
        updatedExercise.sets = undefined;
        updatedExercise.reps = undefined;
      } else {
        if (suggestion.lastSets) updatedExercise.sets = suggestion.lastSets;
        if (suggestion.lastReps) updatedExercise.reps = suggestion.lastReps;
        updatedExercise.effectiveRepsMax = undefined;
        updatedExercise.effectiveRepsTarget = undefined;
      }
    }

    onChange(updatedExercise);
  };

  // Bug #3 fix: confirm before clearing data on ER toggle
  const toggleEffectiveReps = (checked: boolean) => {
    if (!checked) {
      const hasERData = (exercise.effectiveRepsMax && exercise.effectiveRepsMax > 0) ||
                        (exercise.effectiveRepsTarget && exercise.effectiveRepsTarget > 0);
      if (hasERData && !window.confirm('Switch to Sets & Reps? This will clear your Effective Reps data.')) {
        return;
      }
    } else {
      const hasSetsData = (exercise.sets && exercise.sets > 0) ||
                          (exercise.reps && exercise.reps > 0) ||
                          (exercise.repsPerSet && exercise.repsPerSet.some(r => r > 0));
      if (hasSetsData && !window.confirm('Switch to Effective Reps? This will clear your Sets & Reps data.')) {
        return;
      }
    }

    onChange({
      ...exercise,
      useEffectiveReps: checked,
      ...(checked
        ? { sets: undefined, reps: undefined, repsPerSet: undefined }
        : { effectiveRepsMax: undefined, effectiveRepsTarget: undefined }
      ),
    });
  };

  const weightLabel = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
  const summaryLabel = formatCompactSummary(exercise);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border transition-all duration-200',
        isDragging && 'opacity-50 shadow-lg scale-[1.02]',
        isExpanded
          ? 'border-primary/20 bg-card/60 shadow-sm'
          : 'border-border/40 bg-card/30 hover:bg-card/50 hover:border-border/60',
      )}
    >
      <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand?.()}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2.5 px-3 py-3 cursor-pointer select-none">
            {/* Drag handle */}
            <button
              className="touch-none shrink-0 opacity-30 hover:opacity-70 cursor-grab active:cursor-grabbing min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
              data-vaul-no-drag
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Exercise name */}
            <span className="text-sm font-medium flex-1 truncate">
              {exercise.name || 'New Exercise'}
            </span>

            {/* Summary badges */}
            <div className="flex items-center gap-1 shrink-0">
              {weightLabel && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {weightLabel}
                </span>
              )}
              {summaryLabel && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {summaryLabel}
                </span>
              )}
            </div>

            {/* Chevron */}
            <ChevronDown className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0',
              isExpanded && 'rotate-180'
            )} />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-4 border-t border-border/30">
            {/* Exercise name autocomplete */}
            <Autocomplete
              value={exercise.name}
              onChange={(value) => handleInputChange('name', value)}
              onSelect={handleExerciseSelect}
              placeholder="Exercise name"
            />

            {/* Weight */}
            <div>
              <span className="text-xs text-muted-foreground mb-1.5 block">Weight</span>
              <WeightInputs exercise={exercise} onChange={onChange} />
            </div>

            {/* ER toggle */}
            <div className="flex items-center justify-between py-1">
              <Label htmlFor={`er-${exercise.id}`} className="text-xs text-muted-foreground cursor-pointer">
                Effective Reps
              </Label>
              <Switch
                id={`er-${exercise.id}`}
                checked={exercise.useEffectiveReps}
                onCheckedChange={toggleEffectiveReps}
              />
            </div>

            {/* Sets & Reps or Effective Reps */}
            {exercise.useEffectiveReps ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    placeholder="Max"
                    value={exercise.effectiveRepsMax || ''}
                    onChange={(e) => handleInputChange('effectiveRepsMax', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block px-0.5">Max reps</span>
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Target"
                    value={exercise.effectiveRepsTarget || ''}
                    onChange={(e) => handleInputChange('effectiveRepsTarget', parseInt(e.target.value) || undefined)}
                    className="w-full px-3 py-2 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block px-0.5">Target total</span>
                </div>
              </div>
            ) : (
              <SetsAndRepsInputs exercise={exercise} onChange={onChange} />
            )}

            {/* Delete */}
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              className="w-full h-11 text-destructive hover:text-destructive hover:bg-destructive/5 hover:border-destructive/30 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Remove Exercise
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
