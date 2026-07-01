import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DataTableColumn<TRow> = {
  header: string;
  cell: (row: TRow) => React.ReactNode;
  className?: string;
};

export function DataTable<TRow extends { id: string }>({
  columns,
  rows,
  rowHref,
  emptyMessage = "No hay registros todavía.",
}: {
  columns: DataTableColumn<TRow>[];
  rows: TRow[];
  rowHref?: (row: TRow) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.header} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <TableRow key={row.id} className={href ? "" : undefined}>
                {columns.map((column) => (
                  <TableCell key={column.header} className={column.className}>
                    {href ? (
                      <Link href={href} className="block w-full" scroll={false}>
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
