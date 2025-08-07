export interface Exercise {
  id: string;
  name: string;
  weight: string | 'BW'; // Can be a number as string or 'BW' for bodyweight
  sets?: number;
  reps?: number;
  repsPerSet?: number[]; // New: array of reps for each set
  useEffectiveReps: boolean;
  effectiveRepsMax?: number;
  effectiveRepsTarget?: number;
}

export interface Workout {
  id: string;
  name?: string;
  date: Date;
  exercises: Exercise[];
  createdAt: Date;
  updatedAt: Date;
}