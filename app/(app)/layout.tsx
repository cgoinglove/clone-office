import { Caveat } from "next/font/google";
import { redirect } from "next/navigation";
import { isOnboarded } from "@/features/minime/server/onboarded";
import { AppShell } from "@/features/minime/shell/app-shell";
import "@/features/office/office.css";

// The office's handwriting (its notes on the floor), loaded with the app's screens.
const hand = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["600"],
  preload: false,
});

// Every screen of the app shares one frame: the column on the left and what the screens share.
// Someone who has not been through the first steps is sent there first.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isOnboarded()) redirect("/start");
  return (
    <div className={`${hand.variable} flex min-h-0 flex-1`}>
      <AppShell>{children}</AppShell>
    </div>
  );
}
