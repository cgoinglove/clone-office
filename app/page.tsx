import { redirect } from "next/navigation";
import { isOnboarded } from "@/features/minime/server/onboarded";

// The front door: someone new goes through the first steps, everyone else to their clone.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect(isOnboarded() ? "/me" : "/start");
}
