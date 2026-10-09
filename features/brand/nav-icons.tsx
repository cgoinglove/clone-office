// The marks of the app's places (the column) and of Settings' sections, drawn as Thursday draws its
// own: lucide's line icons at their own weight and size, the open row told by its fill and ink, never
// by a different icon. The clone's place is the app's own mark, outlined to stand among them.

import {
  Aperture,
  Building2,
  Cable,
  House,
  ListChecks,
  type LucideIcon,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  SquarePen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

/** Thursday's choices where it has the same place (Models, Connectors, Phone, its settings). */
const ICONS = {
  compose: SquarePen,
  home: House,
  requests: ListChecks,
  office: Building2,
  settings: Settings2,
  brain: Aperture,
  permissions: ShieldCheck,
  connectors: Cable,
  phone: Smartphone,
  general: SlidersHorizontal,
} satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof ICONS | "clone";

export function NavIcon({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}) {
  if (name === "clone")
    return (
      <LogoMark outline nav className={cn("size-4 shrink-0", className)} />
    );
  const Icon = ICONS[name];
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} />;
}
