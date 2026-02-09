'use client';

import { useState, useEffect, useCallback } from 'react';
import { WorkoutPreset, Exercise } from '@/types/workout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PresetForm } from './PresetForm';
import { Plus, ArrowLeft, GripVertical, Pencil, Trash2, Dumbbell, Loader2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface PresetManagerProps {
  onBack: () => void;
}

function SortablePresetCard({
  preset,
  onEdit,
  onDelete,
}: {
  preset: WorkoutPreset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: preset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const exerciseNames = preset.exercises
    .map((e) => e.name)
    .filter(Boolean)
    .slice(0, 5);

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <button
              className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors p-1"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-5 w-5" />
            </button>

            <div className="flex-1 min-w-0">
              <h4 className="font-semibold truncate">{preset.name}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {preset.exercises.length} exercise{preset.exercises.length !== 1 ? 's' : ''}
                {exerciseNames.length > 0 && (
                  <span className="ml-1">
                    — {exerciseNames.join(', ')}
                    {preset.exercises.length > 5 && '...'}
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
                className="h-8 w-8 p-0 interactive-scale"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive interactive-scale"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PresetManager({ onBack }: PresetManagerProps) {
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPreset, setEditingPreset] = useState<WorkoutPreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadPresets = useCallback(async () => {
    try {
      const response = await fetch('/api/presets');
      if (response.ok) {
        const data = await response.json();
        setPresets(
          data.presets.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }))
        );
      }
    } catch (error) {
      console.error('Error loading presets:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleCreatePreset = async (data: { name: string; exercises: Exercise[] }) => {
    try {
      const response = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          name: data.name,
          exercises: data.exercises,
        }),
      });
      if (response.ok) {
        await loadPresets();
        setIsCreating(false);
      }
    } catch (error) {
      console.error('Error creating preset:', error);
    }
  };

  const handleUpdatePreset = async (data: { name: string; exercises: Exercise[] }) => {
    if (!editingPreset) return;
    try {
      const response = await fetch(`/api/presets/${editingPreset.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          exercises: data.exercises,
        }),
      });
      if (response.ok) {
        await loadPresets();
        setEditingPreset(null);
      }
    } catch (error) {
      console.error('Error updating preset:', error);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    try {
      setDeletingPresetId(presetId);
      const response = await fetch(`/api/presets/${presetId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setPresets((prev) => prev.filter((p) => p.id !== presetId));
      }
    } catch (error) {
      console.error('Error deleting preset:', error);
    } finally {
      setDeletingPresetId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = presets.findIndex((p) => p.id === active.id);
    const newIndex = presets.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(presets, oldIndex, newIndex);
    setPresets(reordered);

    // Persist reorder
    try {
      await fetch('/api/presets/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetIds: reordered.map((p) => p.id) }),
      });
    } catch (error) {
      console.error('Error saving reorder:', error);
      await loadPresets(); // Revert on failure
    }
  };

  // Show preset form if creating or editing
  if (isCreating) {
    return (
      <PresetForm
        onSave={handleCreatePreset}
        onCancel={() => setIsCreating(false)}
      />
    );
  }

  if (editingPreset) {
    return (
      <PresetForm
        preset={editingPreset}
        onSave={handleUpdatePreset}
        onCancel={() => setEditingPreset(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="interactive-scale">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h3 className="text-lg font-semibold">Workout Presets</h3>
      </div>

      <Card className="border-border/50 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-5 w-5 text-primary" />
            Your Split
          </CardTitle>
          <CardDescription>
            Drag to reorder your split cycle. The reminder banner follows this order.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : presets.length === 0 ? (
            <div className="text-center py-8">
              <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm mb-4">
                No presets yet. Create your first workout template to get started.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={presets.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {presets.map((preset, index) => (
                    <div key={preset.id} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                        {index + 1}.
                      </span>
                      <div className="flex-1">
                        <SortablePresetCard
                          preset={preset}
                          onEdit={() => setEditingPreset(preset)}
                          onDelete={() => handleDeletePreset(preset.id)}
                        />
                      </div>
                      {deletingPresetId === preset.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <Button
            onClick={() => setIsCreating(true)}
            variant="outline"
            className="w-full border-dashed py-6 hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all duration-200 interactive-scale group"
          >
            <Plus className="h-5 w-5 mr-2 transition-transform duration-200 group-hover:rotate-90" />
            Add Preset
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
