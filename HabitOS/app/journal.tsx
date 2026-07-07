import { AppScreen } from "@/presentation/components/AppScreen";
import { BottomNav } from "@/presentation/components/BottomNav";
import { JournalScreen } from "@/presentation/screens/JournalScreen";

export default function JournalRoute() {
  return (
    <AppScreen>
      <JournalScreen />
      <BottomNav />
    </AppScreen>
  );
}
