"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { z } from "zod";
import { CustomFieldType, EntityType } from "@prisma/client";
import { handleMutationError } from "@/lib/prisma-errors";

const definitionSchema = z.object({
  entityType: z.enum(EntityType),
  fieldName: z
    .string()
    .min(1)
    .regex(/^[a-z][a-zA-Z0-9]*$/, "Usa camelCase sin espacios"),
  fieldLabel: z.string().min(1),
  fieldType: z.enum(CustomFieldType),
  optionsJson: z.string().optional(),
  isRequired: z.coerce.boolean().default(false),
});

export type CustomFieldFormState = { error: string } | undefined;

export async function createCustomFieldDefinition(
  _prevState: CustomFieldFormState,
  formData: FormData,
): Promise<CustomFieldFormState> {
  await requireAdmin();

  const parsed = definitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Revisa los campos del formulario." };
  }

  const options = parsed.data.optionsJson
    ? parsed.data.optionsJson
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean)
    : undefined;

  await prisma.customFieldDefinition.create({
    data: {
      entityType: parsed.data.entityType,
      fieldName: parsed.data.fieldName,
      fieldLabel: parsed.data.fieldLabel,
      fieldType: parsed.data.fieldType,
      isRequired: parsed.data.isRequired,
      optionsJson: options,
    },
  });

  revalidatePath("/admin/custom-fields");
}

export async function deleteCustomFieldDefinition(id: string) {
  await requireAdmin();
  try {
    await prisma.customFieldDefinition.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/admin/custom-fields");
}
