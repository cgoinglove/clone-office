import { redirect } from "next/navigation";

// The clone's page was here before the app had its screens; old links land on the first one.
export default function MePage() {
  redirect("/chat");
}
