import { Bike, GraduationCap, PartyPopper, Users, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const typeConfig: Record<
  string,
  { label: string; icon: React.ElementType; className: string }
> = {
  ride: {
    label: "Ride",
    icon: Bike,
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  clinic: {
    label: "Clinic",
    icon: GraduationCap,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  social: {
    label: "Social",
    icon: PartyPopper,
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  meeting: {
    label: "Meeting",
    icon: Users,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  other: {
    label: "Other",
    icon: HelpCircle,
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
};

export function EventTypeBadge({ type }: { type: string }) {
  const config = typeConfig[type] ?? typeConfig.other;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
