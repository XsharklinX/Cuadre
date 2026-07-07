import { AppScreen } from "@/presentation/components/AppScreen";
import { HabitFormScreen } from "@/presentation/screens/HabitFormScreen";

export default function NewHabitRoute() {
  return (
    <AppScreen>
      <HabitFormScreen />
    </AppScreen>
  );
}
