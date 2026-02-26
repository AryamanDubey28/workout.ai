'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Workout, Exercise, WorkoutPreset, WorkoutType } from '@/types/workout';
import { calculatePace, formatPace } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { ExerciseRow } from './ExerciseRow';
import { useExerciseCache } from '@/hooks/useExerciseCache';
import { PresetPicker } from './PresetPicker';
import { Plus, Calendar, BookTemplate, Dumbbell, Footprints, StickyNote, Check } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface WorkoutFormProps {
  workout?: Workout;
  initialPreset?: WorkoutPreset;
  onSave: (workout: Workout) => void;
  onCancel: () => void;
}

export function WorkoutForm({ workout, initialPreset, onSave, onCancel }: WorkoutFormProps) {
  const [name, setName] = useState(workout?.name || initialPreset?.name || '');
  const [note, setNote] = useState(workout?.note || '');
  const [showNote, setShowNote] = useState(!!(workout?.note));
  const [noteJustActivated, setNoteJustActivated] = useState(false);
  const [workoutDate, setWorkoutDate] = useState(workout?.date || new Date());
  const [workoutType, setWorkoutType] = useState<WorkoutType>(workout?.type || initialPreset?.type || 'strength');
  const [distanceKm, setDistanceKm] = useState(
    workout?.runData?.distanceKm?.toString() || initialPreset?.runData?.distanceKm?.toString() || ''
  );
  const [durationMinutes, setDurationMinutes] = useState(
    workout?.runData?.durationSeconds
      ? Math.floor(workout.runData.durationSeconds / 60).toString()
      : initialPreset?.runData?.durationSeconds
        ? Math.floor(initialPreset.runData.durationSeconds / 60).toString()
        : ''
  );
  const [durationSeconds, setDurationSeconds] = useState(
    workout?.runData?.durationSeconds
      ? (workout.runData.durationSeconds % 60).toString()
      : initialPreset?.runData?.durationSeconds
        ? (initialPreset.runData.durationSeconds % 60).toString()
        : ''
  );
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [availablePresets, setAvailablePresets] = useState<WorkoutPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const initialExercises = workout?.exercises || (initialPreset?.exercises && initialPreset.exercises.length > 0
    ? initialPreset.exercises.map(ex => ({ ...ex, id: crypto.randomUUID() }))
    : null) || ((workout?.type || initialPreset?.type || 'strength') === 'run' ? [] : [
    { id: crypto.randomUUID(), name: '', weight: '', useEffectiveReps: false }
  ]);

  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const { invalidateCache } = useExerciseCache();

  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    !workout && initialExercises.length > 0 ? initialExercises[0].id : null
  );

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);

  // ----- Draft autosave (localStorage) -----
  const draftStorageKey = `workout-ai-draft-${workout?.id ?? 'new'}`;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkForUnsavedChanges = useCallback(() => {
    if (workout) {
      if (name !== (workout.name || '')) return true;
      if (note !== (workout.note || '')) return true;
      if (workoutDate.getTime() !== workout.date.getTime()) return true;
      if (workoutType !== (workout.type || 'strength')) return true;
      if (distanceKm !== (workout.runData?.distanceKm?.toString() || '')) return true;
      if (durationMinutes !== (workout.runData?.durationSeconds ? Math.floor(workout.runData.durationSeconds / 60).toString() : '')) return true;
      if (durationSeconds !== (workout.runData?.durationSeconds ? (workout.runData.durationSeconds % 60).toString() : '')) return true;
      if (exercises.length !== workout.exercises.length) return true;
      return exercises.some((exercise, index) => {
        const originalExercise = workout.exercises[index];
        if (!originalExercise) return true;
        return (
          exercise.name !== originalExercise.name ||
          exercise.weight !== originalExercise.weight ||
          JSON.stringify(exercise.weightsPerSet) !== JSON.stringify(originalExercise.weightsPerSet) ||
          exercise.sets !== originalExercise.sets ||
          exercise.reps !== originalExercise.reps ||
          JSON.stringify(exercise.repsPerSet) !== JSON.stringify(originalExercise.repsPerSet) ||
          exercise.useEffectiveReps !== originalExercise.useEffectiveReps ||
          exercise.effectiveRepsMax !== originalExercise.effectiveRepsMax ||
          exercise.effectiveRepsTarget !== originalExercise.effectiveRepsTarget
        );
      });
    } else {
      const hasRunContent = workoutType === 'run' && (distanceKm.trim() !== '' || durationMinutes.trim() !== '' || durationSeconds.trim() !== '');
      return (
        name.trim() !== '' ||
        note.trim() !== '' ||
        hasRunContent ||
        exercises.some(exercise =>
          exercise.name.trim() !== '' ||
          exercise.weight.trim() !== '' ||
          (exercise.weightsPerSet && exercise.weightsPerSet.length > 0 && exercise.weightsPerSet.some(w => w.trim() !== '')) ||
          (exercise.sets && exercise.sets > 0) ||
          (exercise.reps && exercise.reps > 0) ||
          (exercise.repsPerSet && exercise.repsPerSet.length > 0 && exercise.repsPerSet.some(r => r > 0)) ||
          (exercise.effectiveRepsMax && exercise.effectiveRepsMax > 0) ||
          (exercise.effectiveRepsTarget && exercise.effectiveRepsTarget > 0)
        )
      );
    }
  }, [exercises, name, note, workoutDate, workout, workoutType, distanceKm, durationMinutes, durationSeconds]);

  // Load draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (typeof draft?.name === 'string') setName(draft.name);
        if (typeof draft?.note === 'string') {
          setNote(draft.note);
          if (draft.note) setShowNote(true);
        }
        if (draft?.workoutDate) setWorkoutDate(new Date(draft.workoutDate));
        if (draft?.workoutType === 'run' || draft?.workoutType === 'strength') setWorkoutType(draft.workoutType);
        if (typeof draft?.distanceKm === 'string') setDistanceKm(draft.distanceKm);
        if (typeof draft?.durationMinutes === 'string') setDurationMinutes(draft.durationMinutes);
        if (typeof draft?.durationSeconds === 'string') setDurationSeconds(draft.durationSeconds);
        if (Array.isArray(draft?.exercises)) {
          setExercises(draft.exercises);
          if (!workout && draft.exercises.length > 0 && draft.exercises[0]?.id) {
            setExpandedExerciseId(draft.exercises[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load workout draft:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStorageKey]);

  // Persist draft with debounce
  useEffect(() => {
    const persist = () => {
      try {
        const draft = {
          name, note, workoutDate: workoutDate.toISOString(), workoutType,
          distanceKm, durationMinutes, durationSeconds, exercises,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      } catch (e) {
        console.warn('Failed to save workout draft:', e);
      }
    };
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(persist, 400);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [name, note, workoutDate, workoutType, distanceKm, durationMinutes, durationSeconds, exercises, draftStorageKey]);

  // Flush draft when page becomes hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        try {
          const draft = {
            name, note, workoutDate: workoutDate.toISOString(), workoutType,
            distanceKm, durationMinutes, durationSeconds, exercises,
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(draftStorageKey, JSON.stringify(draft));
        } catch (_) {}
        if (workout?.id) {
          try {
            const totalSec = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0);
            fetch(`/api/workouts/${workout.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: name || workout.name || undefined, note: note.trim(), date: workoutDate,
                type: workoutType,
                runData: workoutType === 'run' ? { distanceKm: parseFloat(distanceKm) || 0, durationSeconds: totalSec } : undefined,
                exercises,
              }),
              credentials: 'include', keepalive: true,
            }).catch(() => {});
          } catch (_) {}
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [name, note, workoutDate, workoutType, distanceKm, durationMinutes, durationSeconds, exercises, draftStorageKey, workout?.id, workout?.name]);

  const clearDraft = () => {
    try { localStorage.removeItem(draftStorageKey); } catch (_) {}
  };

  // Debounced server autosave when editing
  useEffect(() => {
    if (!workout?.id) return;
    const hasAnyContent = checkForUnsavedChanges();
    if (!hasAnyContent) return;

    const triggerServerSave = async () => {
      try {
        setIsSaving(true);
        const totalSec = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0);
        await fetch(`/api/workouts/${workout.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name || workout.name || undefined, note: note.trim(), date: workoutDate,
            type: workoutType,
            runData: workoutType === 'run' ? { distanceKm: parseFloat(distanceKm) || 0, durationSeconds: totalSec } : undefined,
            exercises,
          }),
          credentials: 'include',
        });
      } catch (_) {} finally {
        setTimeout(() => setIsSaving(false), 500);
      }
    };

    if (serverSaveTimeoutRef.current) clearTimeout(serverSaveTimeoutRef.current);
    serverSaveTimeoutRef.current = setTimeout(triggerServerSave, 1200);
    return () => { if (serverSaveTimeoutRef.current) clearTimeout(serverSaveTimeoutRef.current); };
  }, [name, note, workoutDate, workoutType, distanceKm, durationMinutes, durationSeconds, exercises, workout?.id, workout?.name, checkForUnsavedChanges]);

  useEffect(() => {
    setHasUnsavedChanges(checkForUnsavedChanges());
  }, [checkForUnsavedChanges]);

  // --- Actions ---

  const addExercise = () => {
    const newExercise: Exercise = { id: crypto.randomUUID(), name: '', weight: '', useEffectiveReps: false };
    setExercises([...exercises, newExercise]);
    setExpandedExerciseId(newExercise.id);
  };

  const toggleExerciseExpanded = (exerciseId: string) => {
    setExpandedExerciseId(expandedExerciseId === exerciseId ? null : exerciseId);
  };

  const updateExercise = (index: number, updatedExercise: Exercise) => {
    const newExercises = [...exercises];
    newExercises[index] = updatedExercise;
    setExercises(newExercises);
  };

  const deleteExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveExerciseId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = exercises.findIndex((e) => e.id === active.id);
      const newIndex = exercises.findIndex((e) => e.id === over.id);
      setExercises((prev) => arrayMove(prev, oldIndex, newIndex));
    }
    setActiveExerciseId(null);
  };

  // Bug #5: renamed handleCancel → handleClose for clarity
  const handleClose = async () => {
    if (hasUnsavedChanges) {
      try {
        setIsSaving(true);
        const filteredExercises = exercises.filter(ex => ex.name.trim());
        const totalSec = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0);
        const hasRunContent = workoutType === 'run' && (parseFloat(distanceKm) > 0 || totalSec > 0);

        if (filteredExercises.length > 0 || name.trim() || note.trim() || hasRunContent) {
          const workoutToSave: Workout = {
            id: workout?.id || crypto.randomUUID(),
            name: name.trim() || undefined,
            note: note.trim(),
            date: workoutDate,
            type: workoutType,
            runData: workoutType === 'run' ? { distanceKm: parseFloat(distanceKm) || 0, durationSeconds: totalSec } : undefined,
            exercises: filteredExercises,
            createdAt: workout?.createdAt || new Date(),
            updatedAt: new Date(),
          };

          clearDraft();
          await onSave(workoutToSave);

          try {
            for (const exercise of filteredExercises) {
              await fetch('/api/exercises/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  exerciseName: exercise.name,
                  exerciseData: {
                    weight: exercise.weight, weightsPerSet: exercise.weightsPerSet,
                    sets: exercise.sets, reps: exercise.reps, repsPerSet: exercise.repsPerSet,
                    useEffectiveReps: exercise.useEffectiveReps,
                    effectiveRepsMax: exercise.effectiveRepsMax, effectiveRepsTarget: exercise.effectiveRepsTarget,
                  },
                }),
              });
            }
          } catch (error) {
            console.error('Error tracking exercise patterns:', error);
          }
          invalidateCache();
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsSaving(false);
      }
    }
    clearDraft();
    onCancel();
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkoutDate(new Date(e.target.value));
    setShowDatePicker(false);
  };

  const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

  const handleOpenPresetPicker = async () => {
    setIsLoadingPresets(true);
    setShowPresetPicker(true);
    try {
      const response = await fetch('/api/presets');
      if (response.ok) {
        const data = await response.json();
        setAvailablePresets(
          data.presets.map((p: any) => ({ ...p, createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt) }))
        );
      }
    } catch (error) {
      console.error('Error loading presets:', error);
    } finally {
      setIsLoadingPresets(false);
    }
  };

  const handleSelectPreset = (preset: WorkoutPreset) => {
    setName(preset.name);
    if (preset.type) setWorkoutType(preset.type);
    if (preset.type === 'run' && preset.runData) {
      setDistanceKm(preset.runData.distanceKm?.toString() || '');
      const totalSec = preset.runData.durationSeconds || 0;
      setDurationMinutes(Math.floor(totalSec / 60).toString());
      setDurationSeconds((totalSec % 60).toString());
    }
    setExercises(
      preset.exercises.length > 0
        ? preset.exercises.map((ex) => ({ ...ex, id: crypto.randomUUID() }))
        : preset.type === 'run' ? [] : [{ id: crypto.randomUUID(), name: '', weight: '', useEffectiveReps: false }]
    );
    setShowPresetPicker(false);
    if (preset.exercises.length > 0) setExpandedExerciseId(null);
  };

  const handleTypeChange = (type: WorkoutType) => {
    setWorkoutType(type);
    if (type === 'strength' && exercises.length === 0) {
      const newEx: Exercise = { id: crypto.randomUUID(), name: '', weight: '', useEffectiveReps: false };
      setExercises([newEx]);
      setExpandedExerciseId(newEx.id);
    }
    if (type === 'run' && exercises.every(ex => !ex.name.trim())) {
      setExercises([]);
      setExpandedExerciseId(null);
    }
  };

  return (
    <Drawer open={true} onOpenChange={(open) => { if (!open) handleClose(); }} snapPoints={[0.95]} fadeFromIndex={0}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-none">
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="shrink-0 border-b px-4 pb-3 pt-2">
          <input
            type="text"
            placeholder="Workout Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-xl font-bold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/40 focus:ring-0"
          />

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Date pill */}
            {showDatePicker ? (
              <input
                type="date"
                value={formatDateForInput(workoutDate)}
                onChange={handleDateChange}
                onBlur={() => setShowDatePicker(false)}
                className="text-xs px-2.5 py-1 rounded-full border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setShowDatePicker(true)}
                className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground flex items-center gap-1 transition-colors"
              >
                <Calendar className="h-3 w-3" />
                {workoutDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </button>
            )}

            {/* Type toggle pills */}
            <div className="flex rounded-full border overflow-hidden">
              <button
                onClick={() => handleTypeChange('strength')}
                className={`text-xs px-3 py-1 flex items-center gap-1 transition-colors ${
                  workoutType === 'strength' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Dumbbell className="h-3 w-3" />
                Strength
              </button>
              <button
                onClick={() => handleTypeChange('run')}
                className={`text-xs px-3 py-1 flex items-center gap-1 transition-colors ${
                  workoutType === 'run' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Footprints className="h-3 w-3" />
                Run
              </button>
            </div>

            {/* Note toggle */}
            {!showNote && (
              <button
                onClick={() => { setShowNote(true); setNoteJustActivated(true); }}
                className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground flex items-center gap-1 transition-colors"
              >
                <StickyNote className="h-3 w-3" />
                Note
              </button>
            )}

            <div className="flex-1" />

            {/* Save status */}
            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
              {isSaving ? (
                <>
                  <div className="w-2.5 h-2.5 border-[1.5px] border-primary border-t-transparent rounded-full animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  Saved
                </>
              )}
            </span>
          </div>

          {/* Note textarea */}
          {showNote && (
            <textarea
              placeholder="Add a note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              autoFocus={noteJustActivated}
              onFocus={() => setNoteJustActivated(false)}
            />
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {/* Run data */}
          {workoutType === 'run' && (
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Footprints className="h-3.5 w-3.5" />
                Run Details
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block px-0.5">Distance (km)</span>
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block px-0.5">Minutes</span>
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    placeholder="0"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    className="w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-10 transition-colors"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block px-0.5">Seconds</span>
                </div>
              </div>
              {(() => {
                const pace = calculatePace(parseFloat(distanceKm), (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0));
                return pace ? (
                  <div className="text-xs text-primary font-medium">Pace: {formatPace(pace)}</div>
                ) : null;
              })()}
            </div>
          )}

          {/* Exercise list */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={exercises.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {exercises.map((exercise, index) => (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    onChange={(updated) => updateExercise(index, updated)}
                    onDelete={() => deleteExercise(index)}
                    isExpanded={expandedExerciseId === exercise.id}
                    onToggleExpand={() => toggleExerciseExpanded(exercise.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeExerciseId ? (
                <div className="transform rotate-3 opacity-90">
                  <ExerciseRow
                    exercise={exercises.find(ex => ex.id === activeExerciseId)!}
                    onChange={() => {}}
                    onDelete={() => {}}
                    isExpanded={false}
                    onToggleExpand={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Empty state for exercises */}
          {exercises.length === 0 && workoutType === 'strength' && (
            <div className="text-center py-8 text-muted-foreground/60">
              <Dumbbell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No exercises yet</p>
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div className="shrink-0 border-t bg-background px-4 py-3 flex items-center gap-2 safe-area-bottom">
          <Button variant="outline" onClick={addExercise} className="flex-1 h-10">
            <Plus className="h-4 w-4 mr-1.5" />
            {workoutType === 'run' && exercises.length === 0 ? 'Add Exercises' : 'Add Exercise'}
          </Button>
          {!workout && (
            <Button variant="outline" size="icon" onClick={handleOpenPresetPicker} className="h-10 w-10 shrink-0">
              <BookTemplate className="h-4 w-4" />
            </Button>
          )}
          <Button onClick={handleClose} className="px-6 h-10 shrink-0">
            Done
          </Button>
        </div>
        </div>
      </DrawerContent>

      {/* Preset Picker */}
      <PresetPicker
        presets={availablePresets}
        isLoading={isLoadingPresets}
        isOpen={showPresetPicker}
        onSelect={handleSelectPreset}
        onClose={() => setShowPresetPicker(false)}
      />
    </Drawer>
  );
}
