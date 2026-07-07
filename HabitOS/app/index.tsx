import { AppScreen } from "@/presentation/components/AppScreen";
import { BottomNav } from "@/presentation/components/BottomNav";
import { DashboardScreen } from "@/presentation/screens/DashboardScreen";

export default function IndexRoute() {
  return (
    <AppScreen>
      <DashboardScreen />
      <BottomNav />
    </AppScreen>
  );
}
