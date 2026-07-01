import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, pattern = "d MMM yyyy") {
  return format(new Date(date), pattern, { locale: es });
}

export function formatDateTime(date: Date | string) {
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: es });
}
