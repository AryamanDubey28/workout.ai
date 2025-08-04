'use client';

import { useState, useEffect, useCallback } from "react";
import { Dumbbell, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkoutForm } from "@/components/WorkoutForm";
import { WorkoutCard } from "@/components/WorkoutCard";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { AuthForm } from "@/components/AuthForm";
import { UserProfile } from "@/components/UserProfile";
import { Workout } from "@/types/workout";
import { User as UserType } from "@/types/user";

export default function Home() {
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);

  const loadWorkouts = useCallback(async () => {
    try {
      const response = await fetch('/api/workouts');
      if (response.ok) {
        const data = await response.json();
        // Convert date strings back to Date objects
        const workoutsWithDates = data.workouts.map((workout: any) => ({
          ...workout,
          date: new Date(workout.date),
          createdAt: new Date(workout.createdAt),
          updatedAt: new Date(workout.updatedAt),
        }));
        setWorkouts(workoutsWithDates);
      } else {
        console.error('Failed to load workouts');
      }
    } catch (error) {
      console.error('Error loading workouts:', error);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        // Load workouts after successful authentication
        await loadWorkouts();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadWorkouts]);

  // Check authentication status
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleAuthSuccess = () => {
    checkAuth();
  };

  const handleLogout = () => {
    setUser(null);
    setWorkouts([]); // Clear workouts on logout
    setShowProfile(false);
  };

  const handleSaveWorkout = async (workout: Workout) => {
    try {
      if (editingWorkout) {
        // Update existing workout in database
        const response = await fetch(`/api/workouts/${workout.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(workout),
        });

        if (response.ok) {
          const data = await response.json();
          // Convert date strings back to Date objects for the updated workout
          const updatedWorkout = {
            ...data.workout,
            date: new Date(data.workout.date),
            createdAt: new Date(data.workout.createdAt),
            updatedAt: new Date(data.workout.updatedAt),
          };
          // Update the workout in local state
          setWorkouts(workouts.map(w => w.id === workout.id ? updatedWorkout : w));
          setEditingWorkout(null);
        } else {
          const error = await response.json();
          console.error('Failed to update workout:', error.error);
          // Still update local state as fallback
          setWorkouts(workouts.map(w => w.id === workout.id ? workout : w));
          setEditingWorkout(null);
        }
      } else {
        // Save new workout to database
        const response = await fetch('/api/workouts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(workout),
        });

        if (response.ok) {
          const data = await response.json();
          // Convert date strings back to Date objects for the saved workout
          const savedWorkout = {
            ...data.workout,
            date: new Date(data.workout.date),
            createdAt: new Date(data.workout.createdAt),
            updatedAt: new Date(data.workout.updatedAt),
          };
          // Add the saved workout to local state
          setWorkouts([savedWorkout, ...workouts]);
          setIsCreating(false);
        } else {
          const error = await response.json();
          console.error('Failed to save workout:', error.error);
          // Still update local state as fallback
          setWorkouts([workout, ...workouts]);
          setIsCreating(false);
        }
      }
    } catch (error) {
      console.error('Error saving workout:', error);
      // Fallback to local state update
      if (editingWorkout) {
        setWorkouts(workouts.map(w => w.id === workout.id ? workout : w));
        setEditingWorkout(null);
      } else {
        setWorkouts([workout, ...workouts]);
        setIsCreating(false);
      }
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

  const confirmDeleteWorkout = async () => {
    if (workoutToDelete) {
      try {
        const response = await fetch(`/api/workouts/${workoutToDelete.id}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          // Remove from local state after successful deletion
          setWorkouts(workouts.filter(w => w.id !== workoutToDelete.id));
        } else {
          const error = await response.json();
          console.error('Failed to delete workout:', error.error);
          // Still remove from local state as fallback
          setWorkouts(workouts.filter(w => w.id !== workoutToDelete.id));
        }
      } catch (error) {
        console.error('Error deleting workout:', error);
        // Fallback to local state update
        setWorkouts(workouts.filter(w => w.id !== workoutToDelete.id));
      }
      
      setWorkoutToDelete(null);
    }
  };

  const cancelDeleteWorkout = () => {
    setWorkoutToDelete(null);
  };

  const isFormOpen = isCreating || editingWorkout;

  // Show loading spinner
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Dumbbell className="h-8 w-8 text-primary mx-auto mb-2 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth form if not authenticated
  if (!user) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  // Show user profile if requested
  if (showProfile) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Dumbbell className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Workout AI</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setShowProfile(false)}
              >
                Back to Workouts
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Profile Content */}
        <main className="container mx-auto px-4 py-6 sm:py-8 max-w-md">
          <UserProfile user={user} onLogout={handleLogout} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Dumbbell className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">Workout AI</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-2"
            >
              <User className="h-4 w-4" />
              {user.name}
            </Button>
            <ThemeToggle />
          </div>
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
