import {
  Barbell,
  Bed,
  BookOpen,
  Brain,
  Briefcase,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChatTeardropDots,
  Check,
  CheckCircle,
  Coffee,
  Crown,
  Drop,
  Fire,
  FolderOpen,
  ForkKnife,
  Guitar,
  Heart,
  House,
  Leaf,
  Lightbulb,
  Lock,
  Medal,
  Minus,
  Moon,
  PaintBrush,
  PencilSimple,
  PersonSimpleRun,
  PersonSimpleWalk,
  Plant,
  Plus,
  Rocket,
  Shower,
  Sparkle,
  Star,
  Sun,
  SunHorizon,
  Target,
  Tooth,
  TrendDown,
  TrendUp,
  Trophy,
  UsersThree,
  XCircle,
  type Icon as PhosphorIcon,
  type IconWeight,
} from "phosphor-react-native";
import type { StyleProp, ViewStyle } from "react-native";

const REGISTRY = {
  barbell: Barbell,
  bed: Bed,
  "book-open": BookOpen,
  brain: Brain,
  briefcase: Briefcase,
  "calendar-blank": CalendarBlank,
  "caret-left": CaretLeft,
  "caret-right": CaretRight,
  "chart-bar": ChartBar,
  "chat-teardrop-dots": ChatTeardropDots,
  check: Check,
  "check-circle": CheckCircle,
  coffee: Coffee,
  crown: Crown,
  drop: Drop,
  fire: Fire,
  "folder-open": FolderOpen,
  "fork-knife": ForkKnife,
  guitar: Guitar,
  heart: Heart,
  house: House,
  leaf: Leaf,
  lightbulb: Lightbulb,
  lock: Lock,
  medal: Medal,
  minus: Minus,
  moon: Moon,
  "paint-brush": PaintBrush,
  "pencil-simple": PencilSimple,
  "person-simple-run": PersonSimpleRun,
  "person-simple-walk": PersonSimpleWalk,
  plant: Plant,
  plus: Plus,
  rocket: Rocket,
  shower: Shower,
  sparkle: Sparkle,
  star: Star,
  sun: Sun,
  "sun-horizon": SunHorizon,
  target: Target,
  tooth: Tooth,
  "trend-down": TrendDown,
  "trend-up": TrendUp,
  trophy: Trophy,
  "users-three": UsersThree,
  "x-circle": XCircle,
} as const satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof REGISTRY;

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  weight?: IconWeight;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 24, color, weight = "regular", style }: IconProps) {
  const PhosphorComponent = REGISTRY[name];
  return (
    <PhosphorComponent
      size={size}
      weight={weight}
      style={style}
      {...(color !== undefined ? { color } : {})}
    />
  );
}
