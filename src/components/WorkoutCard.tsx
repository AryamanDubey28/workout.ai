'use client';

import { Workout } from '@/types/workout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Edit3 } from 'lucide-react';

interface WorkoutCardProps {
  workout: Workout;
  onClick: () => void;
  onDelete: () => void;
}

export function WorkoutCard({ workout, onClick, onDelete }: WorkoutCardProps) {
  const displayExercises = workout.exercises.slice(0, 5);
  const hasMoreExercises = workout.exercises.length > 5;

  const formatExercise = (exercise: any) => {
    const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
    
    if (exercise.useEffectiveReps) {
      const max = exercise.effectiveRepsMax || 0;
      const target = exercise.effectiveRepsTarget || 0;
      return `${exercise.name} ${weight} - ${max}/${target} ER`.trim();
    } else {
      const sets = exercise.sets || 0;
      const reps = exercise.reps || 0;
      return `${exercise.name} ${weight} - ${sets}x${reps}`.trim();
    }
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 hover:scale-[1.01] group">
      <CardHeader className="pb-3 sm:pb-4">
        <div className="flex items-start justify-between gap-3">
          <div 
            className="flex-1 cursor-pointer" 
            onClick={onClick}
          >
            <CardTitle className="text-base sm:text-lg leading-tight">
              {workout.name || 'Untitled Workout'}
            </CardTitle>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">
              {workout.date.toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric',
                year: workout.date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs">
              {workout.exercises.length}
            </Badge>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="h-8 w-8 p-0 hover:bg-primary/10"
                title="Edit workout"
              >
                <Edit3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="h-8 w-8 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Delete workout"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 cursor-pointer" onClick={onClick}>
        <div className="space-y-1.5 sm:space-y-2">
          {displayExercises.map((exercise, index) => (
            <div key={exercise.id} className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {formatExercise(exercise)}
            </div>
          ))}
          
          {hasMoreExercises && (
            <div className="text-xs text-muted-foreground/70 italic pt-1">
              +{workout.exercises.length - 5} more exercises...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}