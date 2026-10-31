export interface IntelligentPriceInput {
  costPriceCents: number;
  desiredMarginPercent: number;
  cardFeePercent?: number;
  operationalBreakagePercent?: number;
  roundingStepCents?: number;
  competitorReferenceCents?: number | null;
}

export interface PriceDeductionBreakdown {
  cardFeeCents: number;
  operationalBreakageCents: number;
  totalDeductionCents: number;
}

export interface IntelligentPriceResult {
  suggestedSalePriceCents: number;
  grossProfitCents: number;
  deductions: PriceDeductionBreakdown;
  netMarginCents: number;
  netMarginPercent: number;
  markupOnCostPercent: number;
  unitaryCardFeeCents: number;
  unitaryBreakageCents: number;
  input: Required<
    Pick<
      IntelligentPriceInput,
      | "costPriceCents"
      | "desiredMarginPercent"
      | "cardFeePercent"
      | "operationalBreakagePercent"
      | "roundingStepCents"
    >
  >;
}

export class PricingCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingCalculationError";
  }
}

function roundToStep(value: number, step: number): number {
  if (step <= 1) {
    return Math.round(value);
  }
  return Math.round(value / step) * step;
}

export function calculateIntelligentPrice(
  input: IntelligentPriceInput
): IntelligentPriceResult {
  const costPriceCents = Math.max(Math.round(input.costPriceCents), 0);
  const desiredMarginPercent = input.desiredMarginPercent;
  const cardFeePercent = input.cardFeePercent ?? 0;
  const operationalBreakagePercent = input.operationalBreakagePercent ?? 0;
  const roundingStepCents = input.roundingStepCents ?? 1;

  if (!Number.isFinite(desiredMarginPercent) || desiredMarginPercent <= 0) {
    throw new PricingCalculationError("Margem desejada deve ser maior que zero");
  }
  if (cardFeePercent < 0 || operationalBreakagePercent < 0) {
    throw new PricingCalculationError("Taxas não podem ser negativas");
  }
  if (costPriceCents <= 0) {
    throw new PricingCalculationError("Custo do produto deve ser maior que zero");
  }

  const deductionPercent = cardFeePercent + operationalBreakagePercent;
  const denominator = 1 - (desiredMarginPercent + deductionPercent) / 100;

  if (denominator <= 0.05) {
    throw new PricingCalculationError(
      "Soma de margem, taxas e quebras deixa o preço de venda impossível"
    );
  }

  const rawPrice = costPriceCents / denominator;
  const suggestedSalePriceCents = Math.max(
    roundToStep(rawPrice, roundingStepCents),
    costPriceCents + 1
  );

  const unitaryCardFeeCents = (suggestedSalePriceCents * cardFeePercent) / 100;
  const unitaryBreakageCents =
    (suggestedSalePriceCents * operationalBreakagePercent) / 100;

  const cardFeeCents = Math.round(unitaryCardFeeCents);
  const operationalBreakageCents = Math.round(unitaryBreakageCents);
  const totalDeductionCents = cardFeeCents + operationalBreakageCents;

  const grossProfitCents = suggestedSalePriceCents - costPriceCents;
  const netMarginCents = grossProfitCents - totalDeductionCents;
  const netMarginPercent =
    suggestedSalePriceCents > 0
      ? (netMarginCents / suggestedSalePriceCents) * 100
      : 0;
  const markupOnCostPercent =
    costPriceCents > 0 ? (grossProfitCents / costPriceCents) * 100 : 0;

  return {
    suggestedSalePriceCents,
    grossProfitCents,
    deductions: {
      cardFeeCents,
      operationalBreakageCents,
      totalDeductionCents,
    },
    netMarginCents,
    netMarginPercent: Math.round(netMarginPercent * 100) / 100,
    markupOnCostPercent: Math.round(markupOnCostPercent * 100) / 100,
    unitaryCardFeeCents: Math.round(unitaryCardFeeCents),
    unitaryBreakageCents: Math.round(unitaryBreakageCents),
    input: {
      costPriceCents,
      desiredMarginPercent,
      cardFeePercent,
      operationalBreakagePercent,
      roundingStepCents,
    },
  };
}

export function analyzeSalePrice(input: {
  costPriceCents: number;
  salePriceCents: number;
  cardFeePercent?: number;
  operationalBreakagePercent?: number;
}): {
  grossProfitCents: number;
  cardFeeCents: number;
  operationalBreakageCents: number;
  totalDeductionCents: number;
  netMarginCents: number;
  netMarginPercent: number;
  markupOnCostPercent: number;
} {
  const cost = Math.max(Math.round(input.costPriceCents), 0);
  const sale = Math.max(Math.round(input.salePriceCents), 0);
  const cardFeePercent = input.cardFeePercent ?? 0;
  const breakagePercent = input.operationalBreakagePercent ?? 0;

  const grossProfitCents = sale - cost;
  const cardFeeCents = Math.round((sale * cardFeePercent) / 100);
  const operationalBreakageCents = Math.round((sale * breakagePercent) / 100);
  const totalDeductionCents = cardFeeCents + operationalBreakageCents;
  const netMarginCents = grossProfitCents - totalDeductionCents;
  const netMarginPercent = sale > 0 ? (netMarginCents / sale) * 100 : 0;
  const markupOnCostPercent = cost > 0 ? (grossProfitCents / cost) * 100 : 0;

  return {
    grossProfitCents,
    cardFeeCents,
    operationalBreakageCents,
    totalDeductionCents,
    netMarginCents,
    netMarginPercent: Math.round(netMarginPercent * 100) / 100,
    markupOnCostPercent: Math.round(markupOnCostPercent * 100) / 100,
  };
}

export const SUPPORTED_CURRENCIES = ["BRL", "BOB"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  BRL: "R$",
  BOB: "Bs.",
};

export function resolveCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency as SupportedCurrency] ?? currency;
}

export function formatCentsAsCurrency(
  cents: number,
  locale: "pt-BR" | "es-419" = "pt-BR",
  currency = "BRL"
): string {
  const symbol = resolveCurrencySymbol(currency);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${symbol} ${formatted}`;
}
