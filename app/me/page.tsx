import { redirect } from "next/navigation";

// The clone's page was here before the office became the main screen; old links still land.
export default function MePage() {
  redirect("/office");
}
