// Message keys are checked at compile time against the English source.
import type messages from "../messages/en.json";
import type { Locale } from "./locales";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
