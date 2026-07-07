import { AppScreen } from "@/presentation/components/AppScreen";
import { BottomNav } from "@/presentation/components/BottomNav";
import { AchievementsScreen } from "@/presentation/screens/AchievementsScreen";

export default function AchievementsRoute() {
  return (
    <AppScreen>
      <AchievementsScreen />
      <BottomNav />
    </AppScreen>
  );
}
