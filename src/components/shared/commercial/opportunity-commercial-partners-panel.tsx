import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assignOpportunityPartner,
  removeOpportunityPartner,
} from "@/app/(dashboard)/commercial/actions";

type CatalogItem = { id: string; displayName: string };
type Assignment = {
  id: string;
  role: string;
  profitSharePercentage: { toString(): string } | null;
  commercialPartner: CatalogItem;
};

export function OpportunityCommercialPartnersPanel({
  opportunityId,
  assignments,
  catalog,
}: {
  opportunityId: string;
  assignments: Assignment[];
  catalog: CatalogItem[];
}) {
  const assignedIds = new Set(
    assignments.map((item) => item.commercialPartner.id),
  );
  const available = catalog.filter((partner) => !assignedIds.has(partner.id));
  const total = assignments.reduce(
    (sum, assignment) =>
      sum + Number(assignment.profitSharePercentage?.toString() ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Participación partners: {total}%. La participación de Zalantos se define
        y valida al guardar cada oferta.
      </p>
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className="space-y-3 rounded-md border p-3 text-sm"
        >
          <p className="font-medium">
            {assignment.commercialPartner.displayName}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <form
              action={assignOpportunityPartner}
              className="flex flex-1 flex-wrap items-end gap-2"
            >
              <input type="hidden" name="opportunityId" value={opportunityId} />
              <input
                type="hidden"
                name="commercialPartnerId"
                value={assignment.commercialPartner.id}
              />
              <div className="space-y-2">
                <Label>Rol</Label>
                <Input name="role" defaultValue={assignment.role} required />
              </div>
              <div className="space-y-2">
                <Label>% utilidad</Label>
                <Input
                  name="profitSharePercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={
                    assignment.profitSharePercentage?.toString() ?? ""
                  }
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Guardar
              </Button>
            </form>
            <form action={removeOpportunityPartner.bind(null, assignment.id)}>
              <Button type="submit" variant="ghost" size="sm">
                Quitar
              </Button>
            </form>
          </div>
        </div>
      ))}
      {available.length > 0 && (
        <form
          action={assignOpportunityPartner}
          className="grid gap-3 rounded-md border p-4 sm:grid-cols-4"
        >
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="commercialPartnerId">Partner</Label>
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
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Input
              id="role"
              name="role"
              defaultValue="partner comercial"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profitSharePercentage">% utilidad</Label>
            <Input
              id="profitSharePercentage"
              name="profitSharePercentage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              defaultValue="50"
            />
          </div>
          <div className="sm:col-span-4">
            <Button type="submit">Agregar partner</Button>
          </div>
        </form>
      )}
    </div>
  );
}
