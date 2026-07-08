// Formateo de moneda/fecha por organización. Reemplaza el CLP/es-CL
// hardcodeado de la vieja src/lib/currency.ts. Son funciones planas (no
// closures) para poder usarlas tanto en Server como en Client Components —
// estos últimos reciben currency/locale/timezone como props desde el
// Server Component padre (ver OrgSettings en @/lib/tenant).

export function formatCurrencyValue(
  value: number | string,
  currency: string,
  locale: string,
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDateValue(
  value: Date | string,
  timezone: string,
  locale: string,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatDateTimeValue(
  value: Date | string,
  timezone: string,
  locale: string,
) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

// Conveniencia para Server Components/actions que ya tienen `org` a mano
// (via requireOrgContext): evita repetir los 3 argumentos en cada llamado.
export function createFormatters(org: {
  currency: string;
  locale: string;
  timezone: string;
}) {
  return {
    currency: (value: number | string) =>
      formatCurrencyValue(value, org.currency, org.locale),
    date: (value: Date | string) =>
      formatDateValue(value, org.timezone, org.locale),
    dateTime: (value: Date | string) =>
      formatDateTimeValue(value, org.timezone, org.locale),
  };
}
