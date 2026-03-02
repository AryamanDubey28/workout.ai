'use client';

import { useState } from 'react';
import { Exercise, WorkoutPreset, WorkoutType, RunData } from '@/types/workout';
import { calculatePace, formatPace } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExerciseRow } from './ExerciseRow';
import { Plus, X, Save, ArrowLeft, Dumbbell, Footprints } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
  onSave: (preset: { name: string; type?: WorkoutType; runData?: RunData; exercises: Exercise[] }) => void;
  onCancel: () => void;
}

export function PresetForm({ preset, onSave, onCancel }: PresetFormProps) {
  const [name, setName] = useState(preset?.name || '');
  const [workoutType, setWorkoutType] = useState<WorkoutType>(preset?.type || 'strength');
  const [distanceKm, setDistanceKm] = useState(preset?.runData?.distanceKm?.toString() || '');
  const [durationMinutes, setDurationMinutes] = useState(
    preset?.runData?.durationSeconds ? Math.floor(preset.runData.durationSeconds / 60).toString() : ''
  );
  const [durationSeconds, setDurationSeconds] = useState(
    preset?.runData?.durationSeconds ? (preset.runData.durationSeconds % 60).toString() : ''
  );
  const [exercises, setExercises] = useState<Exercise[]>(
    preset?.exercises && preset.exercises.length > 0
      ? preset.exercises
      : preset?.type === 'run'
        ? []
        : [
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
    const totalSec = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0);
    onSave({
      name: name.trim(),
      type: workoutType,
      runData: workoutType === 'run' ? { distanceKm: parseFloat(distanceKm) || 0, durationSeconds: totalSec } : undefined,
      exercises: filteredExercises,
    });
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
            placeholder={workoutType === 'run' ? 'Preset name (e.g. 5K Run, Easy Jog)' : 'Preset name (e.g. Push, Pull, Legs)'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-semibold bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground w-full"
            autoFocus
          />

          {/* Type Toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setWorkoutType('strength');
                if (exercises.length === 0) {
                  setExercises([{ id: crypto.randomUUID(), name: '', weight: '', useEffectiveReps: false }]);
                }
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                workoutType === 'strength'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              <Dumbbell className="h-4 w-4" />
              Strength
            </button>
            <button
              type="button"
              onClick={() => setWorkoutType('run')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                workoutType === 'run'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/30'
              }`}
            >
              <Footprints className="h-4 w-4" />
              Run
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {workoutType === 'run'
              ? 'Set target distance and duration. These will be pre-filled when you start this workout.'
              : 'Exercises will be pre-filled when you load this preset. You can adjust weights/reps each session.'}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Run Data Section */}
          {workoutType === 'run' && (
            <div className="border rounded-lg p-4 bg-card/30 space-y-4">
              <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Footprints className="h-4 w-4" />
                Run Target
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Distance"
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12"
                  />
                  <div className="text-xs text-muted-foreground mt-1.5 px-1">Distance (km)</div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12"
                    />
                    <div className="text-xs text-muted-foreground mt-1.5 px-1">Min</div>
                  </div>
                  <div className="flex-1">
                    <input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="Sec"
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(e.target.value)}
                      className="w-full px-4 py-3 text-base border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary h-12"
                    />
                    <div className="text-xs text-muted-foreground mt-1.5 px-1">Sec</div>
                  </div>
                </div>
              </div>
              {(() => {
                const parsedDist = parseFloat(distanceKm);
                const parsedSec = (parseInt(durationMinutes) || 0) * 60 + (parseInt(durationSeconds) || 0);
                const pace = calculatePace(parsedDist, parsedSec);
                return pace ? (
                  <div className="text-sm text-primary font-medium">
                    Target Pace: {formatPace(pace)}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Exercises Section */}
          {workoutType === 'strength' && (
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
          )}

          {workoutType === 'strength' && (
          <Button
            type="button"
            variant="outline"
            onClick={addExercise}
            className="w-full border-dashed py-6 text-base hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200 interactive-scale group"
          >
            <Plus className="h-5 w-5 mr-2 transition-transform duration-200 group-hover:rotate-90" />
            Add Exercise
          </Button>
          )}
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
