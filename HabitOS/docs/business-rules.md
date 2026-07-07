# Business rules

## Logical dates

- A completion is stored against a local logical date in `YYYY-MM-DD`.
- UTC timestamps are never used directly to compare calendar days.
- A completion is accepted only when `completedAtUtc` resolves to the requested logical date in the action time zone.
- This prevents accidentally writing yesterday or tomorrow when the app crosses midnight or changes time zone.

## Daily habits

- A daily habit is due every local logical day starting on its creation date.
- The current day does not break a streak while it is still incomplete.
- Historical due days without completion break the streak.

## Specific weekday habits

- A specific-weekday habit is due only on configured weekdays starting on its creation date.
- Non-due days are skipped when calculating streaks.
- If frequency is edited, future calculations use the current habit definition. Historical completion records are kept unchanged.

## Times-per-week habits

- A times-per-week habit is eligible every day, but streaks are evaluated by calendar week.
- `weekStartsOn` defines the weekly boundary.
- A completed week counts when unique completion dates reach the weekly target.
- Extra completions in a week do not increase the completion rate beyond 100%.
- The first week is prorated when a habit is created mid-week: required completions are capped by remaining eligible days in that week.
- The current week does not break a streak until the week closes. It counts only if the target has already been reached.

## Archived habits

- Archived habits are not due on the dashboard.
- Archived habits cannot receive new completions.
- Historical completions are preserved for journal/statistics.

## Duplicate completions

- Only one completion per habit per logical date is allowed.
- Repeated app or widget actions return the existing completion instead of creating a duplicate.

## Undo

- Undo removes the completion for the selected habit and logical date.
- Undo also refreshes the widget snapshot contract.
