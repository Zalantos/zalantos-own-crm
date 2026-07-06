const clpFormatter = new Intl.NumberFormat("es-CL", {
  currency: "CLP",
  maximumFractionDigits: 0,
  style: "currency",
});

export function formatCurrency(value: number | string) {
  return clpFormatter.format(Number(value));
}
