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
  rowHref?: (row: TRow) => string | undefined;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  const [titleColumn, ...detailColumns] = columns;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border md:block">
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
                    <TableCell
                      key={column.header}
                      className={column.className}
                    >
                      {href ? (
                        <Link
                          href={href}
                          className="block w-full"
                          scroll={false}
                        >
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

      <div className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const card = (
            <div className="space-y-2 rounded-md border p-4">
              <div className="font-medium">{titleColumn.cell(row)}</div>
              {detailColumns.length > 0 && (
                <div className="space-y-1.5">
                  {detailColumns.map((column) => (
                    <div
                      key={column.header}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {column.header}
                      </span>
                      <span className="text-right">{column.cell(row)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
          return href ? (
            <Link key={row.id} href={href} className="block" scroll={false}>
              {card}
            </Link>
          ) : (
            <div key={row.id}>{card}</div>
          );
        })}
      </div>
    </>
  );
}
