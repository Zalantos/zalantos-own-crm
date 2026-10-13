import { Trash2Icon } from "lucide-react";
import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatDateValue } from "@/lib/format";
import { HolidayForm } from "./holiday-form";
import { deleteHoliday } from "./actions";

export default async function BusinessHolidaysPage() {
  const { db, org } = await requireOrgAdminContext();
  const holidays = await db.businessHoliday.findMany({
    orderBy: { date: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Feriados comerciales"
        description="Días que no cuentan al calcular la vigencia hábil de las ofertas"
      />

      <div className="mb-8 max-w-2xl">
        <HolidayForm />
      </div>

      <div className="max-w-2xl space-y-2">
        {holidays.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No hay feriados configurados.
          </p>
        )}
        {holidays.map((holiday) => (
          <div
            key={holiday.id}
            className="flex items-center justify-between rounded-md border px-4 py-3"
          >
            <div>
              <p className="font-medium">{holiday.name}</p>
              <p className="text-muted-foreground text-sm">
                {formatDateValue(holiday.date, org.timezone, org.locale)}
              </p>
            </div>
            <form action={deleteHoliday.bind(null, holiday.id)}>
              <Button type="submit" variant="ghost" size="icon">
                <Trash2Icon className="h-4 w-4" />
                <span className="sr-only">Eliminar {holiday.name}</span>
              </Button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
