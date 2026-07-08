"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAdminContext } from "@/lib/tenant";
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
  const { org, db } = await requireOrgAdminContext();

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

  await db.customFieldDefinition.create({
    data: {
      organizationId: org.id,
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
  const { db } = await requireOrgAdminContext();
  try {
    await db.customFieldDefinition.delete({ where: { id } });
  } catch (error) {
    handleMutationError(error);
  }
  revalidatePath("/admin/custom-fields");
}
