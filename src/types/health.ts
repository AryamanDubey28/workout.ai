export interface DailyHealthMetrics {
  id?: string;
  userId?: string;
  date: string; // YYYY-MM-DD
  steps?: number;
  activeCalories?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  vo2Max?: number;
  weight?: number;
  distance?: number;
  exerciseMinutes?: number;
  updatedAt?: Date;
}
