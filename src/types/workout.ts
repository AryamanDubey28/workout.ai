export interface Exercise {
  id: string;
  name: string;
  weight: string | 'BW'; // Can be a number as string or 'BW' for bodyweight
  weightsPerSet?: (string | 'BW')[]; // New: array of weights for each set
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
  note?: string;
  date: Date;
  exercises: Exercise[];
  createdAt: Date;
  updatedAt: Date;
}
