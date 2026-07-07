import { AppScreen } from "@/presentation/components/AppScreen";
import { BottomNav } from "@/presentation/components/BottomNav";
import { AnalyticsScreen } from "@/presentation/screens/AnalyticsScreen";

export default function AnalyticsRoute() {
  return (
    <AppScreen>
      <AnalyticsScreen />
      <BottomNav />
    </AppScreen>
  );
}
