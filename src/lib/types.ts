export type MemberStatus = 'pending' | 'in_progress' | 'completed' | 'rest' | 'missed' | 'paused'
export type CoupleDayStatus = MemberStatus | 'recovered'

export interface Profile {
  id: string
  display_name: string
  avatar_path: string | null
  bio: string | null
  birthday: string | null
  timezone: string
  water_goal_ml: number
  steps_goal: number
  activity_goal_min: number
  weekly_workouts_goal: number
  theme: 'system' | 'light' | 'dark'
  accent: string
  notification_prefs: NotificationPrefs
  character?: Record<string, unknown>
  height_cm?: number | null
  goal_weight_kg?: number | null
  start_weight_kg?: number | null
}

export type NotifKind = 'workout' | 'water' | 'habits' | 'streak_risk' | 'partner_activity' | 'streak' | 'goals' | 'challenges' | 'messages' | 'dates' | 'proposals' | 'couple' | 'weekly' | 'cycle'
export type NotificationPrefs = Partial<Record<NotifKind, { enabled?: boolean; time?: string; every_hours?: number; from?: string; to?: string }>>

export interface Couple {
  id: string
  name: string | null
  together_since: string | null
  anniversary_date: string | null
  status: 'active' | 'ended'
  streak_start_date: string
  created_at: string
}

export interface Rules {
  conditions: { workout: boolean; activity: boolean; water: boolean; steps: boolean; habits: boolean }
  require: 'any' | 'all'
  min_workout_minutes: number
  min_activity_minutes: number
  min_steps: number
  min_water_ml: number
  min_habit_checks: number
  weekly_workouts_target: number
  rest_weekdays: number[]
  rest_days_per_week: number
  day_cutoff_minutes: number
  recovery_per_month: number
  easy_days_per_month?: number
  easy_min_minutes?: number
  period_easy_days?: number
  special_rules: string
}

export interface StreakRules { id: string; version: number; effective_from: string; rules: Rules; proposed_by: string | null; approved_by: string | null; created_at: string }

export interface MemberDay {
  couple_id: string
  user_id: string
  day: string
  status: MemberStatus
  details: {
    workouts: number; activity_minutes: number; steps: number; water_ml: number; habit_checks: number
    is_rest: boolean; required: string[]; met: string[]; require: 'any' | 'all'; day_end: string
    is_easy?: boolean; is_paused?: boolean; easy_min?: number
  }
  rules_version: number | null
  updated_at: string
}

export interface StreakDay { couple_id: string; day: string; status: CoupleDayStatus; finalized: boolean; completed_at: string | null; rules_version: number | null }
export interface Streak { couple_id: string; current_count: number; best_count: number; last_completed_day: string | null; updated_at: string }

export type MuscleGroup = 'pecho' | 'espalda' | 'hombros' | 'biceps' | 'triceps' | 'piernas' | 'gluteos' | 'abdomen' | 'cardio' | 'otros'
export interface Exercise { id: string; user_id: string; name: string; muscle_group: MuscleGroup; notes: string | null; archived: boolean }
export interface Routine { id: string; user_id: string; name: string; description: string | null; is_favorite: boolean; weekdays: number[]; routine_exercises?: RoutineExercise[] }
export interface RoutineExercise { id: string; routine_id: string; exercise_id: string; position: number; target_sets: number | null; target_reps: number | null; target_weight_kg: number | null; rest_seconds: number | null; notes: string | null; exercises?: Exercise }
export interface Workout { id: string; user_id: string; routine_id: string | null; title: string; performed_at: string; duration_min: number | null; notes: string | null; local_day: string; joint_with?: string | null; joint_of?: string | null; workout_sets?: WorkoutSet[] }
export interface WorkoutSet { id: string; workout_id: string; exercise_id: string; set_number: number; reps: number | null; weight_kg: number | null; duration_sec: number | null; rest_sec: number | null; notes: string | null; exercises?: Exercise }

export interface WaterLog { id: string; amount_ml: number; label: string | null; performed_at: string; local_day: string }
export interface WaterPreset { id: string; label: string; amount_ml: number; icon: string; position: number }
export type ActivityKind = 'caminata' | 'pasos' | 'cardio' | 'bicicleta' | 'correr' | 'natacion' | 'deporte' | 'yoga' | 'otro'
export interface ActivityLog { id: string; kind: ActivityKind; minutes: number; steps: number; distance_km: number | null; notes: string | null; performed_at: string; local_day: string }

export interface Category { id: string; name: string; color: string; emoji: string | null }
export interface Habit { id: string; name: string; description: string | null; category_id: string | null; emoji: string | null; frequency: 'daily' | 'weekly'; times_per_week: number; reminder_time: string | null; start_date: string; end_date: string | null; archived: boolean }
export interface HabitLog { id: string; habit_id: string; local_day: string }

export type Metric = 'workouts' | 'workout_days' | 'water_ml' | 'water_goal_days' | 'steps' | 'activity_minutes' | 'activity_days' | 'habit_checks' | 'couple_streak_days' | 'manual'
export interface Goal { id: string; user_id: string | null; couple_id: string | null; created_by: string; name: string; description: string | null; category_id: string | null; category_label: string | null; metric: Metric; target: number; frequency: 'daily' | 'weekly' | 'monthly' | 'once'; manual_progress: number; start_date: string; end_date: string | null; status: 'active' | 'completed' | 'paused' | 'archived'; completed_at: string | null }
export interface Challenge { id: string; user_id: string | null; couple_id: string | null; created_by: string; name: string; description: string | null; metric: Exclude<Metric, 'manual'>; target: number; mode: 'each' | 'together'; consecutive: boolean; start_date: string; end_date: string; badge: string; reward: string | null; status: 'active' | 'completed' | 'failed' | 'cancelled'; completed_at: string | null }
export interface Badge { id: string; user_id: string; challenge_id: string | null; badge: string; title: string; reward: string | null; earned_at: string }

export interface CalendarEvent { id: string; couple_id: string; created_by: string; title: string; kind: string; event_date: string; event_time: string | null; yearly: boolean; notes: string | null }
export interface Message { id: string; couple_id: string; sender_id: string; kind: 'text' | 'heart' | 'motivation' | 'photo'; body: string | null; image_path: string | null; created_at: string; read_at: string | null }
export interface Memory { id: string; couple_id: string; created_by: string; title: string; description: string | null; image_path: string | null; memory_date: string; created_at: string }
export interface Note { id: string; couple_id: string; created_by: string; body: string; pinned: boolean; created_at: string }
export interface AppNotification { id: string; kind: string; title: string; body: string | null; data: Record<string, unknown>; created_at: string; read_at: string | null }
export type ProposalKind = 'streak_rules' | 'couple_settings' | 'shared_goal' | 'shared_goal_delete' | 'shared_challenge' | 'shared_challenge_cancel' | 'streak_recovery'
export interface Proposal { id: string; couple_id: string; proposed_by: string; kind: ProposalKind; title: string; payload: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'failed'; created_at: string; resolved_at: string | null; resolved_by: string | null; result: Record<string, unknown> | null }
export interface AuditLog { id: number; couple_id: string | null; user_id: string | null; action: string; details: Record<string, unknown>; created_at: string }
