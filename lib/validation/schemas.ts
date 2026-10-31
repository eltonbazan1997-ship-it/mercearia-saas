import { z } from "zod";
import { FEATURE_KEYS } from "@/lib/features";

export const localeSchema = z.enum(["pt-BR", "es-419"]);

export const currencySchema = z.enum(["BRL", "BOB"]);

export type CurrencyCode = z.infer<typeof currencySchema>;

export const receiptWidthSchema = z.enum(["58mm", "80mm"]);

export const moneyCentsSchema = z
  .number({ invalid_type_error: "Valor deve ser numérico" })
  .int("Valores devem ser inteiros em centavos")
  .nonnegative("Valor não pode ser negativo");

export const barcodeSchema = z
  .string()
  .trim()
  .regex(/^\d{8,14}$/, "Código de barras deve conter de 8 a 14 dígitos");

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome do produto")
    .max(160, "Nome muito longo"),
  barcode: barcodeSchema.nullish(),
  category: z
    .string()
    .trim()
    .min(1, "Informe a categoria")
    .max(60, "Categoria muito longa"),
  unit: z.string().trim().min(1).max(12),
  costPriceCents: moneyCentsSchema,
  salePriceCents: moneyCentsSchema,
  creditPriceCents: moneyCentsSchema.nullish(),
  stockQuantity: z
    .number()
    .int("Estoque deve ser um número inteiro")
    .min(-999999, "Estoque inválido"),
  minStockAlert: z
    .number()
    .int("Estoque mínimo deve ser inteiro")
    .min(0, "Estoque mínimo não pode ser negativo"),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
    .nullish(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.extend({
  id: z.string().uuid("Identificador inválido"),
  isActive: z.boolean().optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const checkoutItemSchema = z.object({
  productId: z.string().uuid("Produto inválido"),
  quantity: z
    .number({ invalid_type_error: "Quantidade inválida" })
    .int("Quantidade deve ser inteira")
    .positive("Quantidade deve ser maior que zero"),
});

export const checkoutSchema = z
  .object({
    items: z
      .array(checkoutItemSchema)
      .min(1, "Carrinho vazio")
      .max(200, "Carrinho excede o limite de itens"),
    paymentMethod: z.enum(["cash", "credit"], {
      errorMap: () => ({ message: "Forma de pagamento inválida" }),
    }),
    customerId: z.string().uuid().nullish(),
    buyerName: z.string().trim().max(140, "Nome do comprador muito longo").nullish(),
    tenderedCents: moneyCentsSchema.nullish(),
    notes: z.string().trim().max(500).nullish(),
    locale: localeSchema,
    sendWhatsApp: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.paymentMethod === "credit" && !value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "Selecione o cliente para venda no fiado",
      });
    }
    if (value.tenderedCents != null && value.items.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Carrinho inválido",
      });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const createCustomerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente")
    .max(140, "Nome muito longo"),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
  creditLimitCents: moneyCentsSchema,
  notes: z.string().trim().max(500).nullish(),
  trustedPerson1Name: z.string().trim().max(140).nullish(),
  trustedPerson1Phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
  trustedPerson2Name: z.string().trim().max(140).nullish(),
  trustedPerson2Phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  id: z.string().uuid("Cliente inválido"),
  fullName: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente")
    .max(140, "Nome muito longo"),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
  creditLimitCents: moneyCentsSchema,
  notes: z.string().trim().max(500).nullish(),
  trustedPerson1Name: z.string().trim().max(140).nullish(),
  trustedPerson1Phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
  trustedPerson2Name: z.string().trim().max(140).nullish(),
  trustedPerson2Phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const updateTenantProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da loja")
    .max(120, "Nome muito longo"),
  currency: currencySchema,
  locale: localeSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{10,15}$/, "Telefone deve ter 10 a 15 dígitos")
    .nullish(),
  address: z.string().trim().max(200).nullish(),
  pixKey: z.string().trim().max(140).nullish(),
  pixKeyType: z
    .enum(["cpf", "cnpj", "email", "phone", "random"], {
      errorMap: () => ({ message: "Tipo de chave Pix inválido" }),
    })
    .nullish(),
  pixName: z.string().trim().max(40).nullish(),
  pixCity: z.string().trim().max(20).nullish(),
  bobQrImage: z
    .string()
    .trim()
    .max(2_000_000, "Imagem muito longa")
    .refine(
      (value) =>
        !value ||
        value.startsWith("https://") ||
        value.startsWith("http://") ||
        value.startsWith("data:image/"),
      "Informe uma URL válida de imagem ou uma imagem em Base64 (data:image/...)"
    )
    .nullish(),
});

export type UpdateTenantProfileInput = z.infer<typeof updateTenantProfileSchema>;

export const settleDebtSchema = z.object({
  customerId: z.string().uuid("Cliente inválido"),
  amountCents: z
    .number({ invalid_type_error: "Valor inválido" })
    .int("Valor deve ser inteiro em centavos")
    .positive("Valor deve ser maior que zero"),
  notes: z.string().trim().max(300).nullish(),
});

export type SettleDebtInput = z.infer<typeof settleDebtSchema>;

export const toggleFeatureSchema = z.object({
  key: z.enum(FEATURE_KEYS, {
    errorMap: () => ({ message: "Recurso desconhecido" }),
  }),
  enabled: z.boolean(),
});

export type ToggleFeatureInput = z.infer<typeof toggleFeatureSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres"),
  fullName: z.string().trim().min(2, "Informe seu nome").max(140),
  storeName: z.string().trim().min(2, "Informe o nome da loja").max(120),
  locale: localeSchema.default("pt-BR"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export interface ActionResultOk<T> {
  ok: true;
  data: T;
}

export interface ActionResultError {
  ok: false;
  error: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
}

export type ActionResult<T> = ActionResultOk<T> | ActionResultError;
