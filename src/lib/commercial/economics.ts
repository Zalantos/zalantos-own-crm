import { Prisma } from "@prisma/client";

const HUNDRED = new Prisma.Decimal(100);
const ZERO = new Prisma.Decimal(0);
const MONEY_SCALE = 4;

export type ProfitShareInput = {
  beneficiaryType: "organization" | "partner";
  commercialPartnerId?: string | null;
  beneficiaryNameSnapshot: string;
  percentage: string | number | Prisma.Decimal;
};

export type CalculatedProfitShare = ProfitShareInput & {
  percentage: Prisma.Decimal;
  amount: Prisma.Decimal;
};

function decimal(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function assertEconomicAmounts(input: {
  status: string;
  economicBaseNetAmount?: string | number | Prisma.Decimal | null;
  projectCostAmount?: string | number | Prisma.Decimal | null;
  distributableProfitAmount?: string | number | Prisma.Decimal | null;
}): void {
  const values = [
    input.economicBaseNetAmount,
    input.projectCostAmount,
    input.distributableProfitAmount,
  ];
  const present = values.filter((value) => value != null && value !== "");
  const requiresCompleteEconomics = input.status === "sent";

  if (requiresCompleteEconomics && present.length !== 3) {
    throw new Error(
      "Una oferta enviada requiere precio neto, costo y utilidad completos.",
    );
  }
  if (present.length !== 0 && present.length !== 3) return;
  if (present.length === 0) return;

  const [base, cost, profit] = values.map((value) => decimal(value!));
  if (base.lessThan(ZERO) || cost.lessThan(ZERO) || profit.lessThan(ZERO)) {
    throw new Error("Los montos económicos no pueden ser negativos.");
  }
  if (!cost.plus(profit).equals(base)) {
    throw new Error(
      "El costo más la utilidad debe coincidir con el precio neto.",
    );
  }
}

export function calculateProfitShares(
  distributableProfit: string | number | Prisma.Decimal,
  shares: ProfitShareInput[],
): CalculatedProfitShare[] {
  const profit = decimal(distributableProfit);
  if (profit.lessThan(ZERO)) {
    throw new Error("La utilidad no puede ser negativa.");
  }
  if (shares.length === 0) {
    throw new Error("Se requiere al menos un beneficiario de la utilidad.");
  }
  const organizationShares = shares.filter(
    (share) => share.beneficiaryType === "organization",
  );
  if (organizationShares.length !== 1) {
    throw new Error(
      "Debe existir exactamente una participación de la organización.",
    );
  }
  const partnerIds = shares
    .filter((share) => share.beneficiaryType === "partner")
    .map((share) => share.commercialPartnerId)
    .filter((id): id is string => Boolean(id));
  if (new Set(partnerIds).size !== partnerIds.length) {
    throw new Error("Cada partner puede aparecer una sola vez en el reparto.");
  }

  const normalized = shares.map((share) => {
    const percentage = decimal(share.percentage);
    if (percentage.lessThan(ZERO) || percentage.greaterThan(HUNDRED)) {
      throw new Error("Cada porcentaje debe estar entre 0 y 100.");
    }
    if (share.beneficiaryType === "partner" && !share.commercialPartnerId) {
      throw new Error("Una participación de partner requiere un partner.");
    }
    return { ...share, percentage };
  });
  const totalPercentage = normalized.reduce(
    (sum, share) => sum.plus(share.percentage),
    ZERO,
  );
  if (!totalPercentage.equals(HUNDRED)) {
    throw new Error(
      "Los porcentajes de utilidad deben sumar exactamente 100%.",
    );
  }

  let allocated = ZERO;
  return normalized.map((share, index) => {
    const isLast = index === normalized.length - 1;
    const amount = isLast
      ? profit.minus(allocated)
      : profit
          .times(share.percentage)
          .dividedBy(HUNDRED)
          .toDecimalPlaces(MONEY_SCALE);
    allocated = allocated.plus(amount);
    return { ...share, amount };
  });
}
