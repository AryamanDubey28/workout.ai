'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Workout, Exercise } from '@/types/workout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExerciseRow } from './ExerciseRow';
import { useExerciseCache } from '@/hooks/useExerciseCache';
import { Plus, X, AlertTriangle, Calendar } from 'lucide-react';
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
  onSave: (workout: Workout) => void;
  onCancel: () => void;
}

export function WorkoutForm({ workout, onSave, onCancel }: WorkoutFormProps) {
  const [name, setName] = useState(workout?.name || '');
  const [workoutDate, setWorkoutDate] = useState(workout?.date || new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  

  const initialExercises = workout?.exercises || [
    {
      id: crypto.randomUUID(),
      name: '',
      weight: '',
      useEffectiveReps: false,
    }
  ];
  
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises);
  const { invalidateCache } = useExerciseCache();
  
  // Auto-expand the first exercise if it's a new workout
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    !workout && initialExercises.length > 0 ? initialExercises[0].id : null
  );

  // Track unsaved changes and confirmation dialog
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);

  // Disable background scrolling when modal is open
  useEffect(() => {
    // Store original overflow style
    const originalOverflow = document.body.style.overflow;
    
    // Disable scrolling
    document.body.style.overflow = 'hidden';
    
    // Cleanup: restore original overflow on unmount
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // ----- Draft autosave (localStorage) -----
  // Keyed by workout id for edits, or "new" for in-progress creation
  const draftStorageKey = `workout-ai-draft-${workout?.id ?? 'new'}`;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for unsaved changes - memoized for stable reference
  const checkForUnsavedChanges = useCallback(() => {
    if (workout) {
      if (name !== (workout.name || '')) return true;
      if (workoutDate.getTime() !== workout.date.getTime()) return true;
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
      return (
        name.trim() !== '' ||
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
  }, [exercises, name, workoutDate, workout]);

  // Load draft on mount (if present). If editing, it will use the workout id key; if creating, uses "new" key.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (typeof draft?.name === 'string') {
          setName(draft.name);
        }
        if (draft?.workoutDate) {
          setWorkoutDate(new Date(draft.workoutDate));
        }
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

  // Persist draft with a small debounce on every change
  useEffect(() => {
    const persist = () => {
      try {
        const draft = {
          name,
          workoutDate: workoutDate.toISOString(),
          exercises,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(draft));
      } catch (e) {
        console.warn('Failed to save workout draft:', e);
      }
    };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(persist, 400);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [name, workoutDate, exercises, draftStorageKey]);

  // Flush draft when the page becomes hidden (backgrounded)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        try {
          const draft = {
            name,
            workoutDate: workoutDate.toISOString(),
            exercises,
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(draftStorageKey, JSON.stringify(draft));
        } catch (e) {
          // noop
        }
        // Also flush server autosave if editing (use keepalive fetch)
        if (workout?.id) {
          try {
            const payload = {
              name: name || workout.name || undefined,
              date: workoutDate, // use the selected date
              exercises,
            };
            fetch(`/api/workouts/${workout.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              credentials: 'include',
              keepalive: true,
            }).catch(() => {});
          } catch (_) {
            // noop
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [name, workoutDate, exercises, draftStorageKey, workout?.id, workout?.name]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftStorageKey);
    } catch (_) {
      // noop
    }
  };

  // Debounced server autosave when editing an existing workout
  useEffect(() => {
    if (!workout?.id) return;

    const hasAnyContent = checkForUnsavedChanges();
    if (!hasAnyContent) return;

    const triggerServerSave = async () => {
      try {
        setIsSaving(true);
        const payload = {
          name: name || workout.name || undefined,
          date: workoutDate, // use the selected date
          exercises,
        };
        await fetch(`/api/workouts/${workout.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include',
        });
      } catch (_) {
        // silent failure; local draft still protects data
      } finally {
        // Show saving state briefly, then fade out
        setTimeout(() => setIsSaving(false), 500);
      }
    };

    if (serverSaveTimeoutRef.current) {
      clearTimeout(serverSaveTimeoutRef.current);
    }
    serverSaveTimeoutRef.current = setTimeout(triggerServerSave, 1200);

    return () => {
      if (serverSaveTimeoutRef.current) {
        clearTimeout(serverSaveTimeoutRef.current);
      }
    };
  }, [name, workoutDate, exercises, workout?.id, workout?.name, checkForUnsavedChanges]);

  useEffect(() => {
    setHasUnsavedChanges(checkForUnsavedChanges());
  }, [checkForUnsavedChanges]);

  const addExercise = () => {
    const newExercise: Exercise = {
      id: crypto.randomUUID(),
      name: '',
      weight: '',
      useEffectiveReps: false,
    };
    setExercises([...exercises, newExercise]);
    // Auto-expand the new exercise for immediate editing
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

  // Handle drag start event
  const handleDragStart = (event: DragStartEvent) => {
    setActiveExerciseId(event.active.id as string);
  };

  // Handle drag end event to reorder exercises
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = exercises.findIndex((exercise) => exercise.id === active.id);
      const newIndex = exercises.findIndex((exercise) => exercise.id === over.id);

      setExercises((exercises) => arrayMove(exercises, oldIndex, newIndex));
    }
    
    setActiveExerciseId(null);
  };



  const handleCancel = async () => {
    // Auto-save before closing if there are changes
    if (hasUnsavedChanges) {
      try {
        setIsSaving(true);
        // Filter out empty exercises for saving
        const filteredExercises = exercises.filter(ex => ex.name.trim());
        
        if (filteredExercises.length > 0 || name.trim()) {
          const workoutToSave: Workout = {
            id: workout?.id || crypto.randomUUID(),
            name: name.trim() || undefined,
            date: workoutDate,
            exercises: filteredExercises,
            createdAt: workout?.createdAt || new Date(),
            updatedAt: new Date(),
          };

          // Auto-save the workout
          await onSave(workoutToSave);
          
          // Track exercise patterns for autocomplete
          try {
            for (const exercise of filteredExercises) {
              await fetch('/api/exercises/track', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  exerciseName: exercise.name,
                  exerciseData: {
                    weight: exercise.weight,
                    weightsPerSet: exercise.weightsPerSet,
                    sets: exercise.sets,
                    reps: exercise.reps,
                    repsPerSet: exercise.repsPerSet,
                    useEffectiveReps: exercise.useEffectiveReps,
                    effectiveRepsMax: exercise.effectiveRepsMax,
                    effectiveRepsTarget: exercise.effectiveRepsTarget,
                  },
                }),
              });
            }
          } catch (error) {
            console.error('Error tracking exercise patterns:', error);
            // Don't fail the save if tracking fails
          }
          
          // Invalidate exercise cache so new patterns are immediately available
          invalidateCache();
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        // If auto-save fails, show confirmation dialog as fallback
        setIsSaving(false);
        setShowConfirmDialog(true);
        return;
      } finally {
        setIsSaving(false);
      }
    }
    
    // Clear any persisted draft on successful close
    clearDraft();
    onCancel();
  };

  const handleConfirmExit = () => {
    setShowConfirmDialog(false);
    // User chose to exit; clear draft to avoid stale data
    clearDraft();
    onCancel();
  };

  const handleCancelExit = () => {
    setShowConfirmDialog(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedDate = new Date(e.target.value);
    setWorkoutDate(selectedDate);
    setShowDatePicker(false);
  };

  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  return (
    /* Modal Backdrop */
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-backdrop-in"
      onClick={handleCancel}
    >
      <Card 
        className="w-full max-w-5xl mx-auto max-h-[90vh] overflow-y-auto animate-modal-in border-border/50 shadow-2xl shadow-black/25"
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click when clicking on the card
      >
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Workout name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground w-full"
              />
              <div className="text-sm text-muted-foreground mt-1 relative">
                {showDatePicker ? (
                  <input
                    type="date"
                    value={formatDateForInput(workoutDate)}
                    onChange={handleDateChange}
                    onBlur={() => setShowDatePicker(false)}
                    className="bg-background border border-border rounded px-2 py-1 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setShowDatePicker(true)}
                    className="hover:text-primary transition-colors duration-200 cursor-pointer underline decoration-dotted underline-offset-2 flex items-center gap-1"
                  >
                    <Calendar className="h-3 w-3" />
                    {workoutDate.toLocaleDateString()}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <div className="text-xs text-muted-foreground mr-2 flex items-center gap-1">
                {isSaving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  "Changes are saved automatically"
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="flex items-center gap-2 interactive-scale hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Done</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Header Row - Only for very large screens */}
          <div className="hidden 2xl:grid grid-cols-12 gap-3 text-sm font-medium text-muted-foreground px-4 pb-2 border-b">
            <div className="col-span-5">Exercise</div>
            <div className="col-span-2">Weight</div>
            <div className="col-span-3">Sets & Reps / Effective Reps</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {/* Exercise Rows */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={exercises.map(exercise => exercise.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {exercises.map((exercise, index) => (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    onChange={(updatedExercise) => updateExercise(index, updatedExercise)}
                    onDelete={() => deleteExercise(index)}
                    isExpanded={expandedExerciseId === exercise.id}
                    onToggleExpand={() => toggleExerciseExpanded(exercise.id)}
                  />
                ))}
              </div>
            </SortableContext>
            
            <DragOverlay>
              {activeExerciseId ? (
                <div className="transform rotate-6 opacity-95">
                  <ExerciseRow
                    exercise={exercises.find(ex => ex.id === activeExerciseId)!}
                    onChange={() => {}} // No-op for overlay
                    onDelete={() => {}} // No-op for overlay
                    isExpanded={expandedExerciseId === activeExerciseId}
                    onToggleExpand={() => {}} // No-op for overlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Add Exercise Button */}
          <div className="text-center">
            <Button
              type="button"
              variant="outline"
              onClick={addExercise}
              className="w-full border-dashed py-6 text-base hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200 interactive-scale group"
            >
              <Plus className="h-5 w-5 mr-2 transition-transform duration-200 group-hover:rotate-90" />
              Add Exercise
            </Button>
            {exercises.length > 1 && (
              <p className="text-xs text-muted-foreground mt-2">
                💡 Click to expand • Drag ⋮⋮ to reorder exercises
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-backdrop-in" onClick={handleCancelExit}>
          <Card className="w-full max-w-md mx-auto animate-modal-in border-border/50 shadow-2xl shadow-black/25" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-full">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  </div>
                  <CardTitle className="text-lg">Save Failed</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelExit}
                  className="h-8 w-8 p-0 interactive-scale"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Unable to auto-save your changes. Would you like to try again or exit without saving?
              </div>
              
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCancelExit}
                  className="flex-1 interactive-scale hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200"
                >
                  Try Again
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmExit}
                  className="flex-1 interactive-scale hover:shadow-lg hover:shadow-destructive/25 transition-all duration-200"
                >
                  Exit Without Saving
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}