import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomFieldDefinitionForm } from "./custom-field-definition-form";
import { deleteCustomFieldDefinition } from "./actions";

const ENTITY_LABELS: Record<string, string> = {
  company: "Empresa",
  person: "Persona",
  opportunity: "Oportunidad",
  activity: "Actividad",
  note: "Nota",
};

export default async function CustomFieldsAdminPage() {
  const { db } = await requireOrgAdminContext();

  const definitions = await db.customFieldDefinition.findMany({
    orderBy: [{ entityType: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Campos custom"
        description="Define campos adicionales para Empresas, Personas y Oportunidades"
      />

      <div className="mb-8 max-w-xl">
        <CustomFieldDefinitionForm />
      </div>

      <div className="space-y-2">
        {definitions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay campos custom definidos.
          </p>
        ) : (
          definitions.map((definition) => (
            <div
              key={definition.id}
              className="flex items-center justify-between rounded-md border p-3 text-sm"
            >
              <div>
                <span className="font-medium">{definition.fieldLabel}</span>{" "}
                <span className="text-muted-foreground">
                  ({definition.fieldName})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {ENTITY_LABELS[definition.entityType]}
                </Badge>
                <Badge variant="outline">{definition.fieldType}</Badge>
                {definition.isRequired && (
                  <Badge variant="outline">Requerido</Badge>
                )}
                <form
                  action={deleteCustomFieldDefinition.bind(null, definition.id)}
                >
                  <Button type="submit" variant="ghost" size="sm">
                    Eliminar
                  </Button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
