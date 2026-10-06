import { useState } from "react";
import { Segmented } from "sub-office";

const col = { display: "grid", gap: 12, justifyItems: "start" } as const;

export const Picks = () => {
  const [mode, setMode] = useState("together");
  const [view, setView] = useState("office");
  return (
    <div style={col}>
      <Segmented
        aria-label="Reply mode"
        options={[
          { value: "together", label: "Together" },
          { value: "auto", label: "Auto" },
          { value: "away", label: "Away" },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Segmented
        aria-label="View"
        view
        options={[
          { value: "desk", label: "My desk" },
          { value: "office", label: "Office" },
        ]}
        value={view}
        onChange={setView}
      />
      <Segmented
        aria-label="Size"
        size="sm"
        options={[
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
        ]}
        value="s"
        onChange={() => {}}
      />
    </div>
  );
};
