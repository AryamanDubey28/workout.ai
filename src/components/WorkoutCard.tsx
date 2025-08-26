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
    if (exercise.useEffectiveReps) {
      const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
      const max = exercise.effectiveRepsMax || 0;
      const target = exercise.effectiveRepsTarget || 0;
      return `${exercise.name} ${weight} - ${max}/${target} ER`.trim();
    }

    // Check if we have per-set weights
    const hasPerSetWeights = exercise.weightsPerSet && exercise.weightsPerSet.length > 0;
    
    if (hasPerSetWeights) {
      // Show combined weight+reps per set for clarity
      const setDetails = [];
      for (let i = 0; i < exercise.weightsPerSet.length; i++) {
        const weight = exercise.weightsPerSet[i];
        const reps = exercise.repsPerSet?.[i] || '?';
        const weightStr = weight === 'BW' ? 'BW' : weight ? `${weight}kg` : '?kg';
        setDetails.push(`${weightStr}×${reps}`);
      }
      return `${exercise.name} ⚖️ ${setDetails.join(', ')}`;
    } else {
      // Standard weight display
      const weight = exercise.weight === 'BW' ? 'BW' : exercise.weight ? `${exercise.weight}kg` : '';
      
      if (exercise.repsPerSet && exercise.repsPerSet.length > 0) {
        const sets = exercise.repsPerSet.length;
        const allSameReps = exercise.repsPerSet.every((reps: number) => reps === exercise.repsPerSet[0]);
        
        if (allSameReps) {
          // All sets have same reps: "Exercise 20kg - 3x8"
          return `${exercise.name} ${weight} - ${sets}x${exercise.repsPerSet[0]}`.trim();
        } else {
          // Different reps per set: "Exercise 20kg - 8, 7, 6"
          return `${exercise.name} ${weight} - ${exercise.repsPerSet.join(', ')}`.trim();
        }
      } else {
        // Fallback to old format
        const sets = exercise.sets || 0;
        const reps = exercise.reps || 0;
        return `${exercise.name} ${weight} - ${sets}x${reps}`.trim();
      }
    }
  };

  return (
    <Card className="hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:scale-[1.02] group cursor-pointer border-border/50 hover:border-border bg-card/50 hover:bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <CardHeader className="pb-3 sm:pb-4 relative">
        <div className="flex items-start justify-between gap-3">
          <div 
            className="flex-1" 
            onClick={onClick}
          >
            <CardTitle className="text-base sm:text-lg leading-tight transition-colors duration-200 group-hover:text-primary">
              {workout.name || 'Untitled Workout'}
            </CardTitle>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span>{workout.date.toLocaleDateString('en-US', { 
                weekday: 'short',
                month: 'short', 
                day: 'numeric',
                year: workout.date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
              })}</span>
              <div className="w-1 h-1 bg-muted-foreground/50 rounded-full" />
              <span className="text-xs">{workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="text-xs transition-all duration-200 group-hover:bg-primary/10 group-hover:text-primary">
              {workout.exercises.length}
            </Badge>
            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 transform sm:translate-x-2 sm:group-hover:translate-x-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick();
                }}
                className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-all duration-200 interactive-scale"
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
                className="h-8 w-8 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-200 interactive-scale"
                title="Delete workout"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 relative" onClick={onClick}>
        <div className="space-y-1.5 sm:space-y-2">
          {displayExercises.map((exercise, index) => (
            <div 
              key={exercise.id} 
              className="text-xs sm:text-sm text-muted-foreground leading-relaxed transition-all duration-200 group-hover:text-foreground/80 transform group-hover:translate-x-1"
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              <span className="inline-block w-2 h-2 bg-primary/30 rounded-full mr-2 transition-all duration-200 group-hover:bg-primary/60" />
              {formatExercise(exercise)}
            </div>
          ))}
          
          {hasMoreExercises && (
            <div className="text-xs text-muted-foreground/70 italic pt-1 transition-all duration-200 group-hover:text-muted-foreground transform group-hover:translate-x-1">
              <span className="inline-block w-2 h-2 bg-muted-foreground/30 rounded-full mr-2" />
              +{workout.exercises.length - 5} more exercises...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}