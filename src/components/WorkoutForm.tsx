'use client';

import { useState } from 'react';
import { Workout, Exercise } from '@/types/workout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExerciseRow } from './ExerciseRow';
import { Plus, Save, X } from 'lucide-react';

interface WorkoutFormProps {
  workout?: Workout;
  onSave: (workout: Workout) => void;
  onCancel: () => void;
}

export function WorkoutForm({ workout, onSave, onCancel }: WorkoutFormProps) {
  const [name, setName] = useState(workout?.name || '');
  const [exercises, setExercises] = useState<Exercise[]>(
    workout?.exercises || []
  );
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);

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

  const handleSave = () => {
    const workoutToSave: Workout = {
      id: workout?.id || crypto.randomUUID(),
      name: name.trim() || undefined,
      date: workout?.date || new Date(),
      exercises: exercises.filter(ex => ex.name.trim()), // Only save exercises with names
      createdAt: workout?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    onSave(workoutToSave);
  };

  const canSave = exercises.some(ex => ex.name.trim());

  return (
    <Card className="w-full max-w-5xl mx-auto">
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
              onClick={onCancel}
              className="flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Cancel</span>
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-2"
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
            className="w-full border-dashed py-6 text-base hover:bg-primary/5"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Exercise
          </Button>
          {exercises.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              💡 Click on any exercise to expand and edit it
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}