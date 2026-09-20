/**
 * Wrapper de íconos sobre lucide-react.
 * Mantiene la misma API prop-based (name, size, stroke, etc.)
 * El ícono `shark` es SVG personalizado — no existe en Lucide.
 */
import type { LucideProps } from 'lucide-react'
import {
  Home, ShoppingCart, Utensils, Car, Zap, Play, Heart,
  ShoppingBag, BookOpen, Wallet, Laptop, TrendingUp,
  LayoutGrid, List, CreditCard, BarChart2, Target,
  Plus, ArrowUp, ArrowDown, Search, Bell, X, Calendar,
  MoreVertical, Pencil, Trash2, Download, Printer,
  Settings, LogOut,
  AlertCircle, CheckCircle2, RefreshCw, Tag, Camera,
  Repeat, DollarSign, PiggyBank, Eye, EyeOff, Share2, ClipboardList,
  Upload, FileJson, SlidersHorizontal, Info, Lock, User, Palette,
  Music, Coffee, Phone, Dumbbell, Building2, Bus,
  Gamepad2, Gift, Scissors, Baby, PawPrint, Pill,
  Plane, Briefcase, Shirt, Pizza, Star, Fuel, Flame, CupSoda,
  TreePine, Sun, Bike, Train, Tv, Monitor,
  Headphones, Clock, Key, Wrench, Paintbrush,
  GraduationCap, Stethoscope, Salad, Wine,
  Crown, Trophy, Shield, MapPin, Package,
  Banknote, Coins, HandCoins, Landmark, Receipt,
} from 'lucide-react'
import type { IconName } from '@/types'

type LucideIcon = React.ComponentType<LucideProps>

const MAP: Partial<Record<IconName, LucideIcon>> = {
  // categorías existentes
  home:     Home,
  cart:     ShoppingCart,
  food:     Utensils,
  car:      Car,
  bolt:     Zap,
  play:     Play,
  heart:    Heart,
  bag:      ShoppingBag,
  book:     BookOpen,
  wallet:   Wallet,
  laptop:   Laptop,
  trend:    TrendingUp,
  // nuevas categorías
  music:    Music,
  coffee:   Coffee,
  phone:    Phone,
  gym:      Dumbbell,
  building: Building2,
  bus:      Bus,
  gamepad:  Gamepad2,
  gift:     Gift,
  scissors: Scissors,
  baby:     Baby,
  paw:      PawPrint,
  pill:     Pill,
  plane:    Plane,
  briefcase: Briefcase,
  shirt:    Shirt,
  pizza:    Pizza,
  star:     Star,
  fuel:     Fuel,
  flame:    Flame,
  soda:     CupSoda,
  // nav
  grid:     LayoutGrid,
  list:     List,
  cards:    CreditCard,
  chart:    BarChart2,
  target:   Target,
  // acciones
  plus:     Plus,
  arrowUp:  ArrowUp,
  arrowDn:  ArrowDown,
  search:   Search,
  bell:     Bell,
  close:    X,
  calendar: Calendar,
  dots:     MoreVertical,
  edit:     Pencil,
  trash:    Trash2,
  download: Download,
  print:    Printer,
  // extras
  settings: Settings,
  logout:   LogOut,
  repeat:   Repeat,
  share:    Share2,
  clipboard: ClipboardList,
  tag:      Tag,
  camera:   Camera,
  check:    CheckCircle2,
  alert:    AlertCircle,
  refresh:  RefreshCw,
  dollar:   DollarSign,
  piggy:    PiggyBank,
  sliders:  SlidersHorizontal,
  upload:   Upload,
  fileJson: FileJson,
  eye:      Eye,
  eyeOff:   EyeOff,
  info:     Info,
  lock:     Lock,
  user:     User,
  palette:  Palette,
  // 20 nuevos
  tree:        TreePine,
  sun:         Sun,
  bike:        Bike,
  train:       Train,
  tv:          Tv,
  monitor:     Monitor,
  headphones:  Headphones,
  clock:       Clock,
  key:         Key,
  tool:        Wrench,
  brush:       Paintbrush,
  graduation:  GraduationCap,
  stethoscope: Stethoscope,
  salad:       Salad,
  wine:        Wine,
  crown:       Crown,
  trophy:      Trophy,
  shield:      Shield,
  map:         MapPin,
  package:     Package,
  // financieros
  banknote:    Banknote,
  coins:       Coins,
  handCoins:   HandCoins,
  landmark:    Landmark,
  receipt:     Receipt,
}

interface IconProps {
  name:       IconName
  size?:      number
  stroke?:    number
  fill?:      string
  style?:     React.CSSProperties
  className?: string
}

export function Icon({ name, size = 20, stroke = 2, fill = 'none', style, className }: IconProps) {
  // ícono personalizado para el logo
  if (name === 'shark') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
        stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
        strokeLinejoin="round" style={style} className={className} aria-hidden="true">
        <path d="M2 12c4-1 6-4 11-4 4 0 7 2 9 4-2 2-5 4-9 4-2 0-3-.5-4-1l-3 3 .5-3.5C4 14 3 13 2 12z" />
      </svg>
    )
  }

  const LucideIcon = MAP[name] ?? MoreVertical
  return (
    <LucideIcon
      size={size}
      strokeWidth={stroke}
      fill={fill}
      style={style}
      className={className}
      aria-hidden="true"
    />
  )
}
