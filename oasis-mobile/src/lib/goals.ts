import AsyncStorage from "@react-native-async-storage/async-storage";

export type GoalId =
  | "balanced"
  | "gym"
  | "bulk"
  | "diabetic"
  | "fat-loss"
  | "pcos"
  | "protein-budget"
  | "kids"
  | "parents";

export const GOAL_OPTIONS: { id: GoalId; label: string }[] = [
  { id: "balanced", label: "Balanced" },
  { id: "gym", label: "Gym" },
  { id: "bulk", label: "Bulk" },
  { id: "diabetic", label: "Diabetic" },
  { id: "fat-loss", label: "Fat loss" },
  { id: "pcos", label: "PCOS" },
  { id: "protein-budget", label: "Protein budget" },
  { id: "kids", label: "Kids" },
  { id: "parents", label: "Parents" },
];

const STORAGE_KEY = "scout-goal";

export async function readStoredGoal(): Promise<GoalId> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw && GOAL_OPTIONS.some((g) => g.id === raw)) return raw as GoalId;
  return "balanced";
}

export async function writeStoredGoal(goal: GoalId): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, goal);
}
