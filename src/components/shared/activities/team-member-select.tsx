"use client";

import { cn } from "@/lib/utils";
import type { AssignableTeamMember } from "@/lib/team";

// El miembro actualmente seleccionado puede estar desactivado (fuera de
// teamMembers); se agrega como opción para que el select refleje el estado
// real en vez de perder silenciosamente la selección.
export function TeamMemberSelect({
  teamMembers,
  currentId,
  currentName,
  name,
  placeholder = "Sin responsable",
  onChange,
  className,
}: {
  teamMembers: AssignableTeamMember[];
  currentId?: string | null;
  currentName?: string | null;
  name?: string;
  placeholder?: string;
  onChange?: (memberId: string | null) => void;
  className?: string;
}) {
  const currentIsListed =
    !currentId || teamMembers.some((member) => member.id === currentId);

  return (
    <select
      name={name}
      defaultValue={currentId ?? ""}
      onChange={
        onChange ? (event) => onChange(event.target.value || null) : undefined
      }
      className={cn(
        "bg-background h-8 rounded-md border px-2 text-xs",
        className,
      )}
    >
      <option value="">{placeholder}</option>
      {!currentIsListed && currentId && (
        <option value={currentId}>
          {currentName ?? "Persona desactivada"}
        </option>
      )}
      {teamMembers.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
        </option>
      ))}
    </select>
  );
}
