export type StockStatusLevel = "GREEN" | "ORANGE" | "RED";

export interface StockEvaluation {
  status: StockStatusLevel;
  remaining: number;
  currentStock: number;
  cartQuantity: number;
  minStockAlert: number;
  blocked: boolean;
  label: string;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  barcode: string | null;
  category: string;
  unit: string;
  costPriceCents: number;
  salePriceCents: number;
  creditPriceCents: number;
  stockQuantity: number;
  minStockAlert: number;
  expiresOn: string | null;
  isActive: boolean;
}

export interface CartItem {
  productId: string;
  name: string;
  barcode: string | null;
  unit: string;
  category: string;
  salePriceCents: number;
  creditPriceCents: number;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
  stockQuantity: number;
  minStockAlert: number;
}

export interface CustomerCreditProfile {
  id: string;
  fullName: string;
  phoneNumber: string | null;
  debtCents: number;
  creditLimitCents: number;
  availableCreditCents: number;
  canTakeMore: boolean;
}

export const STOCK_STATUS_LABELS: Record<StockStatusLevel, string> = {
  GREEN: "Saudável",
  ORANGE: "Atenção",
  RED: "Esgotado",
};

export function evaluateStockLevel(
  currentStock: number,
  cartQuantity: number,
  minStockAlert: number
): StockEvaluation {
  const safeCurrent = Number.isFinite(currentStock) ? currentStock : 0;
  const safeCart = Number.isFinite(cartQuantity) && cartQuantity > 0 ? cartQuantity : 0;
  const safeMin = Number.isFinite(minStockAlert) && minStockAlert >= 0 ? minStockAlert : 0;
  const remaining = safeCurrent - safeCart;

  let status: StockStatusLevel;
  if (remaining <= 0) {
    status = "RED";
  } else if (remaining <= safeMin) {
    status = "ORANGE";
  } else {
    status = "GREEN";
  }

  return {
    status,
    remaining,
    currentStock: safeCurrent,
    cartQuantity: safeCart,
    minStockAlert: safeMin,
    blocked: status === "RED",
    label: STOCK_STATUS_LABELS[status],
  };
}

export function buildCartSubtotalCents(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.subtotalCents, 0);
}

export type PaymentMode = "cash" | "credit";

export function unitPriceForPayment(
  item: Pick<CartItem, "salePriceCents" | "creditPriceCents">,
  paymentMethod: PaymentMode
): number {
  if (paymentMethod === "credit" && item.creditPriceCents > 0) {
    return item.creditPriceCents;
  }
  return item.salePriceCents;
}

export function repriceCartForPayment(
  items: CartItem[],
  paymentMethod: PaymentMode
): CartItem[] {
  return items.map((item) => {
    const unitPriceCents = unitPriceForPayment(item, paymentMethod);
    if (unitPriceCents === item.unitPriceCents) {
      return item;
    }
    return {
      ...item,
      unitPriceCents,
      subtotalCents: unitPriceCents * item.quantity,
    };
  });
}

export function upsertCartItem(items: CartItem[], incoming: CartItem): CartItem[] {
  const existing = items.find((item) => item.productId === incoming.productId);
  if (!existing) {
    return [...items, incoming];
  }
  return items.map((item) =>
    item.productId === incoming.productId
      ? {
          ...item,
          quantity: item.quantity + incoming.quantity,
          subtotalCents: (item.quantity + incoming.quantity) * item.unitPriceCents,
        }
      : item
  );
}

export function changeCartItemQuantity(
  items: CartItem[],
  productId: string,
  delta: number
): CartItem[] {
  return items
    .map((item) => {
      if (item.productId !== productId) {
        return item;
      }
      const quantity = item.quantity + delta;
      return { ...item, quantity, subtotalCents: quantity * item.unitPriceCents };
    })
    .filter((item) => item.quantity > 0);
}

export function buildCustomerCreditProfile(customer: {
  id: string;
  full_name: string;
  phone_number: string | null;
  debt_cents: number;
  credit_limit_cents: number;
}): CustomerCreditProfile {
  const availableCreditCents = Math.max(
    customer.credit_limit_cents - customer.debt_cents,
    0
  );
  return {
    id: customer.id,
    fullName: customer.full_name,
    phoneNumber: customer.phone_number,
    debtCents: customer.debt_cents,
    creditLimitCents: customer.credit_limit_cents,
    availableCreditCents,
    canTakeMore: customer.credit_limit_cents === 0 || availableCreditCents > 0,
  };
}

type FeedbackSoundType = "SUCCESS" | "WARNING" | "ERROR";

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  const AudioContextCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }
  if (!sharedAudioContext || sharedAudioContext.state === "closed") {
    sharedAudioContext = new AudioContextCtor();
  }
  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

function playTone(
  context: AudioContext,
  frequency: number,
  type: OscillatorType,
  startOffset: number,
  durationSeconds: number,
  volume: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startTime = context.currentTime + startOffset;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds + 0.05);
}

export function playPOSFeedbackSound(type: FeedbackSoundType): void {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  try {
    if (type === "SUCCESS") {
      playTone(context, 880, "sine", 0, 0.14, 0.16);
      playTone(context, 880, "sine", 0.16, 0.1, 0.1);
    } else if (type === "WARNING") {
      playTone(context, 440, "sine", 0, 0.12, 0.16);
      playTone(context, 330, "sine", 0.14, 0.16, 0.16);
    } else {
      playTone(context, 180, "sawtooth", 0, 0.24, 0.18);
    }
  } catch {
    return;
  }
}
