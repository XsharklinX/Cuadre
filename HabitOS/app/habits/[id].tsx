import { useLocalSearchParams } from "expo-router";

import { AppScreen } from "@/presentation/components/AppScreen";
import { HabitFormScreen } from "@/presentation/screens/HabitFormScreen";

export default function EditHabitRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <AppScreen>
      <HabitFormScreen habitId={id} />
    </AppScreen>
  );
}
