import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assignExistingCompanyPartner,
  createAndAssignCompanyPartner,
  removeCompanyPartner,
} from "@/app/(dashboard)/commercial/actions";

type CatalogItem = { id: string; displayName: string; kind: string };
type CompanyOption = { id: string; name: string };
type PersonOption = { id: string; firstName: string; lastName: string };
type Assignment = {
  id: string;
  role: string;
  defaultProfitSharePercentage: { toString(): string } | null;
  commercialPartner: CatalogItem;
};

export function CompanyCommercialPartnersPanel({
  companyId,
  assignments,
  catalog,
  companies,
  people,
}: {
  companyId: string;
  assignments: Assignment[];
  catalog: CatalogItem[];
  companies: CompanyOption[];
  people: PersonOption[];
}) {
  const assignedIds = new Set(
    assignments.map((assignment) => assignment.commercialPartner.id),
  );
  const available = catalog.filter((partner) => !assignedIds.has(partner.id));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {assignments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin partners comerciales.
          </p>
        ) : (
          assignments.map((assignment) => (
            <div
              key={assignment.id}
              className="space-y-3 rounded-md border p-3 text-sm"
            >
              <p className="font-medium">
                {assignment.commercialPartner.displayName}
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <form
                  action={assignExistingCompanyPartner}
                  className="flex flex-1 flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="companyId" value={companyId} />
                  <input
                    type="hidden"
                    name="commercialPartnerId"
                    value={assignment.commercialPartner.id}
                  />
                  <Field
                    name="role"
                    label="Rol"
                    defaultValue={assignment.role}
                  />
                  <Field
                    name="defaultProfitSharePercentage"
                    label="% utilidad por defecto"
                    type="number"
                    defaultValue={
                      assignment.defaultProfitSharePercentage?.toString() ?? ""
                    }
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Guardar
                  </Button>
                </form>
                <form action={removeCompanyPartner.bind(null, assignment.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Desactivar
                  </Button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>

      {available.length > 0 && (
        <form
          action={assignExistingCompanyPartner}
          className="grid gap-3 rounded-md border p-4 sm:grid-cols-4"
        >
          <input type="hidden" name="companyId" value={companyId} />
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="commercialPartnerId">Partner existente</Label>
            <select
              id="commercialPartnerId"
              name="commercialPartnerId"
              required
              className="bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Seleccionar...</option>
              {available.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.displayName}
                </option>
              ))}
            </select>
          </div>
          <Field name="role" label="Rol" defaultValue="partner comercial" />
          <Field
            name="defaultProfitSharePercentage"
            label="% utilidad"
            type="number"
            defaultValue="50"
          />
          <div className="sm:col-span-4">
            <Button type="submit" variant="secondary">
              Asignar partner
            </Button>
          </div>
        </form>
      )}

      <form
        action={createAndAssignCompanyPartner}
        className="grid gap-3 rounded-md border p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="companyId" value={companyId} />
        <div className="sm:col-span-2">
          <h3 className="text-sm font-medium">Crear partner y asignar</h3>
          <p className="text-muted-foreground text-xs">
            Para un partner externo deja sin seleccionar empresa y persona
            vinculada.
          </p>
        </div>
        <Field name="displayName" label="Nombre" required />
        <div className="space-y-2">
          <Label htmlFor="kind">Tipo</Label>
          <select
            id="kind"
            name="kind"
            defaultValue="external"
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="external">Externo</option>
            <option value="company">Empresa del CRM</option>
            <option value="person">Persona del CRM</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="linkedCompanyId">Empresa vinculada</Label>
          <select
            id="linkedCompanyId"
            name="linkedCompanyId"
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Ninguna</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="linkedPersonId">Persona vinculada</Label>
          <select
            id="linkedPersonId"
            name="linkedPersonId"
            className="bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            <option value="">Ninguna</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.firstName} {person.lastName}
              </option>
            ))}
          </select>
        </div>
        <Field
          name="role"
          label="Rol"
          defaultValue="partner comercial"
          required
        />
        <Field
          name="defaultProfitSharePercentage"
          label="% utilidad por defecto"
          type="number"
          defaultValue="50"
        />
        <div className="sm:col-span-2">
          <Button type="submit">Crear y asignar</Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}
