export const FEATURE_KEYS = [
  "fiado",
  "whatsapp",
  "thermal_printer",
  "pos_sounds",
  "stock_block",
  "price_calculator",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type TenantFeatures = Record<FeatureKey, boolean>;

export const DEFAULT_TENANT_FEATURES: TenantFeatures = {
  fiado: true,
  whatsapp: false,
  thermal_printer: true,
  pos_sounds: true,
  stock_block: false,
  price_calculator: true,
};

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(value);
}

export function normalizeFeatures(
  row: Partial<TenantFeatures> | null | undefined
): TenantFeatures {
  return {
    fiado: row?.fiado ?? DEFAULT_TENANT_FEATURES.fiado,
    whatsapp: row?.whatsapp ?? DEFAULT_TENANT_FEATURES.whatsapp,
    thermal_printer: row?.thermal_printer ?? DEFAULT_TENANT_FEATURES.thermal_printer,
    pos_sounds: row?.pos_sounds ?? DEFAULT_TENANT_FEATURES.pos_sounds,
    stock_block: row?.stock_block ?? DEFAULT_TENANT_FEATURES.stock_block,
    price_calculator:
      row?.price_calculator ?? DEFAULT_TENANT_FEATURES.price_calculator,
  };
}
