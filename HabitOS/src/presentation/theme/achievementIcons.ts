import type { AchievementDefinition } from "@/domain/gamification";
import type { IconName } from "@/presentation/components/Icon";

export function achievementIconName(achievement: AchievementDefinition): IconName {
  return achievement.icon as IconName;
}
