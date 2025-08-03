'use client';

import { useState } from "react";
import { Dumbbell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutForm } from "@/components/WorkoutForm";
import { WorkoutCard } from "@/components/WorkoutCard";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Workout } from "@/types/workout";

export default function Home() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);

  const handleSaveWorkout = (workout: Workout) => {
    if (editingWorkout) {
      // Update existing workout
      setWorkouts(workouts.map(w => w.id === workout.id ? workout : w));
      setEditingWorkout(null);
    } else {
      // Add new workout
      setWorkouts([workout, ...workouts]);
      setIsCreating(false);
    }
  };

  const handleEditWorkout = (workout: Workout) => {
    setEditingWorkout(workout);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingWorkout(null);
  };

  const handleNewWorkout = () => {
    setIsCreating(true);
    setEditingWorkout(null);
  };

  const handleDeleteWorkout = (workout: Workout) => {
    setWorkoutToDelete(workout);
  };

  const confirmDeleteWorkout = () => {
    if (workoutToDelete) {
      setWorkouts(workouts.filter(w => w.id !== workoutToDelete.id));
      setWorkoutToDelete(null);
    }
  };

  const cancelDeleteWorkout = () => {
    setWorkoutToDelete(null);
  };

  const isFormOpen = isCreating || editingWorkout;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Dumbbell className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Workout AI</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 sm:py-8 max-w-6xl">
        {isFormOpen ? (
          <WorkoutForm
            workout={editingWorkout || undefined}
            onSave={handleSaveWorkout}
            onCancel={handleCancel}
          />
        ) : (
          <>
            {/* Header with Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold">My Workouts</h2>
                <p className="text-muted-foreground text-sm sm:text-base">Track and organize your fitness journey</p>
              </div>
              <Button
                onClick={handleNewWorkout}
                className="flex items-center gap-2 self-start sm:self-auto"
                size="lg"
              >
                <Plus className="h-4 w-4" />
                New Workout
              </Button>
            </div>

            {/* Workouts Grid */}
            {workouts.length === 0 ? (
              <div className="text-center py-12 sm:py-16">
                <div className="mx-auto w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Dumbbell className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">No workouts yet</h3>
                <p className="text-muted-foreground mb-4 text-sm sm:text-base px-4">
                  Start your fitness journey by creating your first workout
                </p>
                <Button onClick={handleNewWorkout} className="flex items-center gap-2" size="lg">
                  <Plus className="h-4 w-4" />
                  Create Your First Workout
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {workouts.map((workout) => (
                  <WorkoutCard
                    key={workout.id}
                    workout={workout}
                    onClick={() => handleEditWorkout(workout)}
                    onDelete={() => handleDeleteWorkout(workout)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={!!workoutToDelete}
        workoutName={workoutToDelete?.name || 'Untitled Workout'}
        onConfirm={confirmDeleteWorkout}
        onCancel={cancelDeleteWorkout}
      />
    </div>
  );
}
