import {
  Bell,
  BookOpen,
  Calendar,
  Camera,
  ChartColumn,
  Clock,
  CreditCard,
  FileText,
  Gift,
  Globe,
  Heart,
  House,
  LayoutDashboard,
  ListChecks,
  Lock,
  type LucideIcon,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Truck,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { type RoadmapIcon, resolveIcon } from "../icons";

const ICONS: Record<RoadmapIcon, LucideIcon> = {
  calendar: Calendar,
  payment: CreditCard,
  bell: Bell,
  dashboard: LayoutDashboard,
  settings: Settings,
  lock: Lock,
  chat: MessageCircle,
  users: Users,
  search: Search,
  cart: ShoppingCart,
  chart: ChartColumn,
  file: FileText,
  map: MapPin,
  star: Star,
  home: House,
  mail: Mail,
  camera: Camera,
  book: BookOpen,
  heart: Heart,
  clock: Clock,
  shield: ShieldCheck,
  truck: Truck,
  wallet: Wallet,
  gift: Gift,
  list: ListChecks,
  upload: Upload,
  globe: Globe,
  phone: Smartphone,
  sparkles: Sparkles,
};

/** Ikon fitur (dekoratif; nama fitur selalu tertulis di sampingnya). */
export function FeatureIcon({
  icon,
  name,
  className,
}: {
  icon: string | null;
  name: string;
  className?: string;
}) {
  const Icon = ICONS[resolveIcon(icon, name)];
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden />;
}
