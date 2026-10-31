export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableShape<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type TenantRow = {
  id: string;
  name: string;
  slug: string | null;
  locale: "pt-BR" | "es-419";
  currency: string;
  receipt_width: "58mm" | "80mm";
  address: string | null;
  phone: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  pix_name: string | null;
  pix_city: string | null;
  bob_qr_image: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfileRow = {
  id: string;
  tenant_id: string;
  full_name: string;
  role: "owner" | "manager" | "cashier";
  locale: "pt-BR" | "es-419";
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: string;
  tenant_id: string;
  name: string;
  barcode: string | null;
  category: string;
  unit: string;
  cost_price_cents: number;
  sale_price_cents: number;
  credit_price_cents: number;
  stock_quantity: number;
  min_stock_alert: number;
  expires_on: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerRow = {
  id: string;
  tenant_id: string;
  full_name: string;
  phone_number: string | null;
  credit_limit_cents: number;
  debt_cents: number;
  notes: string | null;
  trusted_person_1_name: string | null;
  trusted_person_1_phone: string | null;
  trusted_person_2_name: string | null;
  trusted_person_2_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantFeatureRow = {
  tenant_id: string;
  fiado: boolean;
  whatsapp: boolean;
  thermal_printer: boolean;
  pos_sounds: boolean;
  stock_block: boolean;
  price_calculator: boolean;
  created_at: string;
  updated_at: string;
};

export type SaleRow = {
  id: string;
  tenant_id: string;
  operator_id: string | null;
  customer_id: string | null;
  payment_method: "cash" | "credit";
  subtotal_cents: number;
  credited_cents: number;
  tendered_cents: number | null;
  change_cents: number | null;
  notes: string | null;
  created_at: string;
};

export type SaleItemRow = {
  id: string;
  tenant_id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  created_at: string;
};

export type CreditTransactionRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  sale_id: string | null;
  type: "debit" | "payment" | "adjustment";
  amount_cents: number;
  balance_after_cents: number;
  operator_id: string | null;
  notes: string | null;
  created_at: string;
};

export type WhatsappDeliveryLogRow = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  recipient_phone: string;
  message_body: string;
  payload_cents: number | null;
  status: "pending" | "sent" | "failed";
  provider_message_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CheckoutSaleItemArg = {
  product_id: string;
  quantity: number;
};

export type CheckoutSaleArgs = {
  p_tenant_id: string;
  p_operator_id: string;
  p_items: CheckoutSaleItemArg[];
  p_payment_method?: "cash" | "credit";
  p_customer_id?: string | null;
  p_tendered_cents?: number | null;
  p_notes?: string | null;
};

export type CheckoutSaleResult = {
  sale_id: string;
  payment_method: "cash" | "credit";
  subtotal_cents: number;
  credited_cents: number;
  tendered_cents: number | null;
  change_cents: number | null;
  debt_before_cents: number;
  debt_after_cents: number;
  customer_id: string | null;
  items: Array<{
    product_id: string;
    name: string;
    barcode: string | null;
    category: string;
    unit: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
    min_stock_alert: number;
    stock_before: number;
    stock_after: number;
  }>;
  issued_at: string;
  notes: string | null;
};

export type Database = {
  public: {
    Tables: {
      tenants: TableShape<TenantRow>;
      user_profiles: TableShape<UserProfileRow>;
      products: TableShape<ProductRow>;
      customers: TableShape<CustomerRow>;
      tenant_features: TableShape<TenantFeatureRow>;
      sales: TableShape<SaleRow>;
      sale_items: TableShape<SaleItemRow>;
      credit_transactions: TableShape<CreditTransactionRow>;
      whatsapp_delivery_logs: TableShape<WhatsappDeliveryLogRow>;
    };
    Views: Record<string, never>;
    Functions: {
      get_current_tenant_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      decrement_product_stock: {
        Args: { p_product_id: string; p_quantity: number };
        Returns: undefined;
      };
      increment_customer_debt: {
        Args: { p_customer_id: string; p_amount_cents: number };
        Returns: number;
      };
      settle_customer_debt: {
        Args: {
          p_tenant_id: string;
          p_customer_id: string;
          p_operator_id: string;
          p_amount_cents: number;
          p_notes?: string | null;
        };
        Returns: number;
      };
      checkout_sale: {
        Args: CheckoutSaleArgs;
        Returns: CheckoutSaleResult;
      };
      get_dashboard_analytics: {
        Args: {
          p_tenant_id?: string;
          p_period?: "today" | "7d" | "30d";
        };
        Returns: Json;
      };
      get_dashboard_analytics_by_period: {
        Args: {
          p_tenant_id: string;
          p_start_date: string;
          p_end_date: string;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type DashboardTopProductRow = {
  product_id: string | null;
  product_name: string;
  units_sold: number;
  revenue_cents: number;
};

export type DashboardWeekHistoryRow = {
  week_start: string;
  revenue_cents: number;
  orders_count: number;
  credit_issued_cents: number;
};

export type DashboardAnalyticsRow = {
  today_sales_cents: number;
  today_orders_count: number;
  today_credit_cents: number;
  total_debt_cents: number;
  top_products_today: DashboardTopProductRow[];
  top_products_7d: DashboardTopProductRow[];
  top_products_30d: DashboardTopProductRow[];
  weekly_history_90d: DashboardWeekHistoryRow[];
};

export type DashboardDailyPoint = {
  day: string;
  revenue_cents: number;
  orders_count: number;
  credit_cents: number;
};

export type DashboardPeriodRow = {
  period_sales_cents: number;
  period_orders_count: number;
  period_credit_cents: number;
  compare_sales_cents: number;
  compare_orders_count: number;
  total_debt_cents: number;
  daily_timeline: DashboardDailyPoint[];
  top_products: DashboardTopProductRow[];
};

export type DatabaseRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
