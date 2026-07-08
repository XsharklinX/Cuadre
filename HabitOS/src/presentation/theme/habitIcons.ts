import type { IconName } from "@/presentation/components/Icon";

export interface HabitIconOption {
  id: IconName;
  label: string;
  category: string;
}

export const HABIT_ICON_CATEGORIES: Array<{ category: string; icons: HabitIconOption[] }> = [
  {
    category: "Salud",
    icons: [
      { id: "drop", label: "Agua", category: "Salud" },
      { id: "heart", label: "Corazón", category: "Salud" },
      { id: "tooth", label: "Higiene dental", category: "Salud" },
    ],
  },
  {
    category: "Fitness",
    icons: [
      { id: "barbell", label: "Fuerza", category: "Fitness" },
      { id: "person-simple-run", label: "Correr", category: "Fitness" },
      { id: "person-simple-walk", label: "Caminar", category: "Fitness" },
    ],
  },
  {
    category: "Mente y foco",
    icons: [
      { id: "book-open", label: "Lectura", category: "Mente y foco" },
      { id: "brain", label: "Enfoque", category: "Mente y foco" },
      { id: "lightbulb", label: "Ideas", category: "Mente y foco" },
      { id: "plant", label: "Mindfulness", category: "Mente y foco" },
    ],
  },
  {
    category: "Productividad",
    icons: [
      { id: "check-circle", label: "Tareas", category: "Productividad" },
      { id: "briefcase", label: "Trabajo", category: "Productividad" },
      { id: "calendar-blank", label: "Planificación", category: "Productividad" },
      { id: "target", label: "Meta", category: "Productividad" },
    ],
  },
  {
    category: "Sueño",
    icons: [
      { id: "moon", label: "Dormir", category: "Sueño" },
      { id: "bed", label: "Descanso", category: "Sueño" },
      { id: "sun-horizon", label: "Madrugar", category: "Sueño" },
    ],
  },
  {
    category: "Alimentación",
    icons: [
      { id: "fork-knife", label: "Comida", category: "Alimentación" },
      { id: "coffee", label: "Café", category: "Alimentación" },
    ],
  },
  {
    category: "Creatividad",
    icons: [
      { id: "paint-brush", label: "Pintar", category: "Creatividad" },
      { id: "pencil-simple", label: "Escribir", category: "Creatividad" },
      { id: "guitar", label: "Música", category: "Creatividad" },
    ],
  },
  {
    category: "Higiene",
    icons: [{ id: "shower", label: "Ducha", category: "Higiene" }],
  },
  {
    category: "Social",
    icons: [
      { id: "users-three", label: "Familia y amigos", category: "Social" },
      { id: "chat-teardrop-dots", label: "Conectar", category: "Social" },
    ],
  },
];

export const HABIT_ICONS: HabitIconOption[] = HABIT_ICON_CATEGORIES.flatMap((group) => group.icons);

export const DEFAULT_HABIT_ICON: IconName = "target";
