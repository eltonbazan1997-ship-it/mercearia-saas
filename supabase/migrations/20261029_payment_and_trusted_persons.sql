-- Rodada de melhorias: pagamento Pix/QR Simple, preço no fiado e pessoas de confiança.
-- Todas as mudanças são idempotentes (add column if not exists).

-- 1) Dados de recebimento da loja (Pix e imagem do QR Simple / BOB)
alter table public.tenants
  add column if not exists pix_key text,
  add column if not exists pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  add column if not exists pix_name text,
  add column if not exists pix_city text,
  add column if not exists bob_qr_image text;

comment on column public.tenants.pix_key is 'Chave Pix usada para gerar o QR de recebimento';
comment on column public.tenants.pix_key_type is 'Tipo da chave Pix (cpf, cnpj, email, phone, random)';
comment on column public.tenants.pix_name is 'Nome do recebedor no payload Pix (max 25)';
comment on column public.tenants.pix_city is 'Cidade do recebedor no payload Pix (max 15)';
comment on column public.tenants.bob_qr_image is 'URL ou data URI Base64 da imagem do QR Simple em bolivianos';

-- 2) Preço praticado nas vendas no fiado
alter table public.products
  add column if not exists credit_price_cents integer not null default 0 check (credit_price_cents >= 0);

comment on column public.products.credit_price_cents is 'Preço cobrado nas vendas no fiado (centavos)';

-- 3) Pessoas de confiança do cliente (podem comprar no fiado do titular)
alter table public.customers
  add column if not exists trusted_person_1_name text,
  add column if not exists trusted_person_1_phone text,
  add column if not exists trusted_person_2_name text,
  add column if not exists trusted_person_2_phone text;

comment on column public.customers.trusted_person_1_name is 'Pessoa 1 de confiança autorizada a comprar no fiado do titular';
comment on column public.customers.trusted_person_1_phone is 'Telefone da pessoa 1 de confiança';
comment on column public.customers.trusted_person_2_name is 'Pessoa 2 de confiança autorizada a comprar no fiado do titular';
comment on column public.customers.trusted_person_2_phone is 'Telefone da pessoa 2 de confiança';

-- 4) Compatibilidade com dados já existentes: preenche o preço no fiado com o preço de venda
update public.products
   set credit_price_cents = sale_price_cents
 where credit_price_cents = 0
   and sale_price_cents > 0;
