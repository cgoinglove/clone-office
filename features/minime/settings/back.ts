"use client";

import { createContext } from "react";

/**
 * A page inside a Settings section (the folder list in Permissions) names its way back here, so Esc
 * goes back to the section rather than closing Settings.
 */
export const SettingsBack = createContext<(back: (() => void) | null) => void>(
  () => {},
);
