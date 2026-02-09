'use client';

import { useState } from 'react';
import { Exercise, WorkoutPreset } from '@/types/workout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExerciseRow } from './ExerciseRow';
import { Plus, X, Save, ArrowLeft } from 'lucide-react';
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

interface PresetFormProps {
  preset?: WorkoutPreset;
  onSave: (preset: { name: string; exercises: Exercise[] }) => void;
  onCancel: () => void;
}

export function PresetForm({ preset, onSave, onCancel }: PresetFormProps) {
  const [name, setName] = useState(preset?.name || '');
  const [exercises, setExercises] = useState<Exercise[]>(
    preset?.exercises || [
      {
        id: crypto.randomUUID(),
        name: '',
        weight: '',
        useEffectiveReps: false,
      },
    ]
  );
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(
    !preset && exercises.length > 0 ? exercises[0].id : null
  );
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const addExercise = () => {
    const newExercise: Exercise = {
      id: crypto.randomUUID(),
      name: '',
      weight: '',
      useEffectiveReps: false,
    };
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

  const handleSave = () => {
    if (!name.trim()) return;
    const filteredExercises = exercises.filter((ex) => ex.name.trim());
    onSave({ name: name.trim(), exercises: filteredExercises });
  };

  const canSave = name.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="interactive-scale">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h3 className="text-lg font-semibold">
          {preset ? 'Edit Preset' : 'New Preset'}
        </h3>
      </div>

      <Card className="border-border/50 shadow-lg">
        <CardHeader className="space-y-3 pb-4">
          <input
            type="text"
            placeholder="Preset name (e.g. Push, Pull, Legs)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground w-full"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Exercises will be pre-filled when you load this preset. You can adjust weights/reps each session.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={exercises.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
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
                <div className="transform rotate-6 opacity-95">
                  <ExerciseRow
                    exercise={exercises.find((ex) => ex.id === activeExerciseId)!}
                    onChange={() => {}}
                    onDelete={() => {}}
                    isExpanded={expandedExerciseId === activeExerciseId}
                    onToggleExpand={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <Button
            type="button"
            variant="outline"
            onClick={addExercise}
            className="w-full border-dashed py-6 text-base hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200 interactive-scale group"
          >
            <Plus className="h-5 w-5 mr-2 transition-transform duration-200 group-hover:rotate-90" />
            Add Exercise
          </Button>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel} className="flex-1 interactive-scale">
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 interactive-scale hover:shadow-lg hover:shadow-primary/25 transition-all duration-200"
        >
          <Save className="h-4 w-4 mr-2" />
          {preset ? 'Update Preset' : 'Save Preset'}
        </Button>
      </div>
    </div>
  );
}
