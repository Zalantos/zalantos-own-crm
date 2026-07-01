"use client";

import { toggleWorkflowActive } from "./actions";

export function WorkflowToggle({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <input
        type="checkbox"
        defaultChecked={isActive}
        onChange={(event) =>
          void toggleWorkflowActive(id, event.target.checked)
        }
        className="border-input h-4 w-4 rounded"
      />
      Activo
    </label>
  );
}
