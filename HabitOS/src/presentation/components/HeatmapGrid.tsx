import { ScrollView, Text, View } from "react-native";

import { weekdayOf } from "@/dates/logicalDate";
import type { DayCompletion } from "@/domain/insights";
import { heatmapCellColor } from "@/presentation/theme/colors";

interface HeatmapGridProps {
  days: DayCompletion[];
}

const CELL_SIZE = 12;
const CELL_GAP = 3;
const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function HeatmapGrid({ days }: HeatmapGridProps) {
  const weeks = buildWeeks(days);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View className="flex-row" style={{ marginBottom: 4 }}>
          {weeks.map((week, index) => {
            const firstDay = week.find((day) => day !== undefined);
            const month = firstDay ? Number(firstDay.date.slice(5, 7)) - 1 : undefined;
            const previousMonth = index > 0 ? monthOfWeek(weeks[index - 1]) : undefined;
            const showLabel = month !== undefined && month !== previousMonth;
            return (
              <View key={index} style={{ width: CELL_SIZE + CELL_GAP }}>
                {showLabel ? (
                  <Text className="text-[9px] text-base-muted">{MONTH_LABELS[month ?? 0]}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        <View className="flex-row">
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={{ marginRight: CELL_GAP }}>
              {week.map((day, dayIndex) => (
                <View
                  key={dayIndex}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    marginBottom: CELL_GAP,
                    borderRadius: 3,
                    backgroundColor: day ? heatmapCellColor(day.dueCount, day.rate) : "transparent",
                  }}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function monthOfWeek(week: Array<DayCompletion | undefined> | undefined): number | undefined {
  const firstDay = week?.find((day) => day !== undefined);
  return firstDay ? Number(firstDay.date.slice(5, 7)) - 1 : undefined;
}

function buildWeeks(days: DayCompletion[]): Array<Array<DayCompletion | undefined>> {
  const weeks: Array<Array<DayCompletion | undefined>> = [];
  const first = days[0];
  if (!first) {
    return weeks;
  }

  let currentWeek: Array<DayCompletion | undefined> = new Array(weekdayOf(first.date) - 1).fill(undefined);
  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(undefined);
    }
    weeks.push(currentWeek);
  }
  return weeks;
}
