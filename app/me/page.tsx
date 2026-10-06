import type { Metadata } from "next";
import { FirstRun } from "@/features/minime/first-run";
import "@/features/office/office.css";

export const metadata: Metadata = { title: "My mini-me · sub-office" };

export default function MinimePage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <FirstRun />
    </main>
  );
}
