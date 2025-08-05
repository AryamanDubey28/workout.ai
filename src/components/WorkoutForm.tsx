'use client';

import { useState, useEffect } from 'react';
import { Workout, Exercise } from '@/types/workout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExerciseRow } from './ExerciseRow';
import { useExerciseCache } from '@/hooks/useExerciseCache';
import { Plus, Save, X, AlertTriangle } from 'lucide-react';

interface WorkoutFormProps {
  workout?: Workout;
  onSave: (workout: Workout) => void;
  onCancel: () => void;
}

export function WorkoutForm({ workout, onSave, onCancel }: WorkoutFormProps) {
  const [name, setName] = useState(workout?.name || '');
  
  // Initialize exercises - if it's a new workout, start with one empty exercise
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

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges = checkForUnsavedChanges();
    setHasUnsavedChanges(hasChanges);
  }, [name, exercises]);

  const checkForUnsavedChanges = () => {
    // If editing an existing workout
    if (workout) {
      // Check if name changed
      if (name !== (workout.name || '')) return true;
      
      // Check if exercises changed (simplified check - could be more sophisticated)
      if (exercises.length !== workout.exercises.length) return true;
      
      // Check if any exercise content changed
      return exercises.some((exercise, index) => {
        const originalExercise = workout.exercises[index];
        if (!originalExercise) return true;
        
        return (
          exercise.name !== originalExercise.name ||
          exercise.weight !== originalExercise.weight ||
          exercise.sets !== originalExercise.sets ||
          exercise.reps !== originalExercise.reps ||
          exercise.useEffectiveReps !== originalExercise.useEffectiveReps ||
          exercise.effectiveRepsMax !== originalExercise.effectiveRepsMax ||
          exercise.effectiveRepsTarget !== originalExercise.effectiveRepsTarget
        );
      });
    } else {
      // For new workouts, check if any content has been entered
      return (
        name.trim() !== '' || 
        exercises.some(exercise => 
          exercise.name.trim() !== '' || 
          exercise.weight.trim() !== '' ||
          (exercise.sets && exercise.sets > 0) ||
          (exercise.reps && exercise.reps > 0) ||
          (exercise.effectiveRepsMax && exercise.effectiveRepsMax > 0) ||
          (exercise.effectiveRepsTarget && exercise.effectiveRepsTarget > 0)
        )
      );
    }
  };

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

  const handleSave = async () => {
    const filteredExercises = exercises.filter(ex => ex.name.trim());
    
    const workoutToSave: Workout = {
      id: workout?.id || crypto.randomUUID(),
      name: name.trim() || undefined,
      date: workout?.date || new Date(),
      exercises: filteredExercises, // Only save exercises with names
      createdAt: workout?.createdAt || new Date(),
      updatedAt: new Date(),
    };

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
              sets: exercise.sets,
              reps: exercise.reps,
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

    onSave(workoutToSave);
    
    // Invalidate exercise cache so new patterns are immediately available
    invalidateCache();
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      setShowConfirmDialog(true);
    } else {
      onCancel();
    }
  };

  const handleConfirmExit = () => {
    setShowConfirmDialog(false);
    onCancel();
  };

  const handleCancelExit = () => {
    setShowConfirmDialog(false);
  };

  const canSave = exercises.some(ex => ex.name.trim());

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
              <div className="text-sm text-muted-foreground mt-1">
                {workout?.date.toLocaleDateString() || new Date().toLocaleDateString()}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="flex items-center gap-2 interactive-scale hover:bg-destructive/5 hover:border-destructive/20 hover:text-destructive transition-all duration-200"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Cancel</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave}
                className="flex items-center gap-2 interactive-scale hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">Save</span>
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
                💡 Click on any exercise to expand and edit it
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
                  <CardTitle className="text-lg">Unsaved Changes</CardTitle>
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
                You have unsaved changes to this workout. Are you sure you want to exit? 
                Your changes will not be saved.
              </div>
              
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleCancelExit}
                  className="flex-1 interactive-scale hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200"
                >
                  Keep Editing
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