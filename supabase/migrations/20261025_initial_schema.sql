create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.get_current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.tenant_id
    from public.user_profiles up
   where up.id = auth.uid();
$$;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text unique,
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'es-419')),
  currency text not null default 'BRL',
  receipt_width text not null default '58mm' check (receipt_width in ('58mm', '80mm')),
  address text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'owner' check (role in ('owner', 'manager', 'cashier')),
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'es-419')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  barcode text,
  category text not null default 'geral',
  unit text not null default 'un',
  cost_price_cents integer not null default 0 check (cost_price_cents >= 0),
  sale_price_cents integer not null default 0 check (sale_price_cents >= 0),
  stock_quantity integer not null default 0,
  min_stock_alert integer not null default 5 check (min_stock_alert >= 0),
  expires_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 140),
  phone_number text,
  credit_limit_cents integer not null default 0 check (credit_limit_cents >= 0),
  debt_cents integer not null default 0 check (debt_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_features (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  fiado boolean not null default true,
  whatsapp boolean not null default false,
  thermal_printer boolean not null default true,
  pos_sounds boolean not null default true,
  stock_block boolean not null default false,
  price_calculator boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  operator_id uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  payment_method text not null check (payment_method in ('cash', 'credit')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  credited_cents integer not null default 0 check (credited_cents >= 0),
  tendered_cents integer check (tendered_cents is null or tendered_cents >= 0),
  change_cents integer check (change_cents is null or change_cents >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  created_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  type text not null check (type in ('debit', 'payment', 'adjustment')),
  amount_cents integer not null check (amount_cents > 0),
  balance_after_cents integer not null check (balance_after_cents >= 0),
  operator_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.whatsapp_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  recipient_phone text not null,
  message_body text not null,
  payload_cents integer check (payload_cents is null or payload_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_tenant_idx on public.products(tenant_id);
create index products_barcode_idx on public.products(barcode);
create unique index products_tenant_barcode_uniq on public.products(tenant_id, barcode) where barcode is not null;
create index products_tenant_name_idx on public.products(tenant_id, name);
create index user_profiles_tenant_idx on public.user_profiles(tenant_id);
create index customers_tenant_idx on public.customers(tenant_id);
create index customers_phone_idx on public.customers(tenant_id, phone_number);
create index customers_name_idx on public.customers(tenant_id, full_name);
create index sales_tenant_created_idx on public.sales(tenant_id, created_at desc);
create index sales_customer_idx on public.sales(customer_id);
create index sale_items_sale_idx on public.sale_items(sale_id);
create index credit_transactions_customer_idx on public.credit_transactions(customer_id, created_at desc);
create index credit_transactions_tenant_idx on public.credit_transactions(tenant_id, created_at desc);
create index whatsapp_delivery_logs_tenant_idx on public.whatsapp_delivery_logs(tenant_id, created_at desc);

create trigger trg_tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger trg_user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger trg_tenant_features_updated_at before update on public.tenant_features
  for each row execute function public.set_updated_at();
create trigger trg_whatsapp_logs_updated_at before update on public.whatsapp_delivery_logs
  for each row execute function public.set_updated_at();

create or replace function public.fn_on_tenant_created_features()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_features (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger trg_on_tenant_created_features
after insert on public.tenants
for each row execute function public.fn_on_tenant_created_features();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_tenant_name text;
  v_slug text;
begin
  v_tenant_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'tenant_name'), ''), 'Minha Mercearia');
  v_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug) || '-' || substr(md5(new.id::text || now()::text), 1, 6);

  insert into public.tenants (name, slug)
  values (v_tenant_name, v_slug)
  returning id into v_tenant_id;

  insert into public.user_profiles (id, tenant_id, full_name, role, locale)
  values (
    new.id,
    v_tenant_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'operador'), '@', 1)),
    'owner',
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'pt-BR')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.tenants enable row level security;
alter table public.user_profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.tenant_features enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.whatsapp_delivery_logs enable row level security;

create policy tenants_select_own on public.tenants
  for select using (id = public.get_current_tenant_id());
create policy tenants_update_own on public.tenants
  for update using (id = public.get_current_tenant_id())
  with check (id = public.get_current_tenant_id());

create policy user_profiles_select on public.user_profiles
  for select using (id = auth.uid() or tenant_id = public.get_current_tenant_id());
create policy user_profiles_insert on public.user_profiles
  for insert with check (id = auth.uid());
create policy user_profiles_update on public.user_profiles
  for update using (id = auth.uid() or tenant_id = public.get_current_tenant_id())
  with check (id = auth.uid() and tenant_id = public.get_current_tenant_id());

create policy products_select on public.products
  for select using (tenant_id = public.get_current_tenant_id());
create policy products_insert on public.products
  for insert with check (tenant_id = public.get_current_tenant_id());
create policy products_update on public.products
  for update using (tenant_id = public.get_current_tenant_id())
  with check (tenant_id = public.get_current_tenant_id());
create policy products_delete on public.products
  for delete using (tenant_id = public.get_current_tenant_id());

create policy customers_select on public.customers
  for select using (tenant_id = public.get_current_tenant_id());
create policy customers_insert on public.customers
  for insert with check (tenant_id = public.get_current_tenant_id());
create policy customers_update on public.customers
  for update using (tenant_id = public.get_current_tenant_id())
  with check (tenant_id = public.get_current_tenant_id());
create policy customers_delete on public.customers
  for delete using (tenant_id = public.get_current_tenant_id());

create policy tenant_features_select on public.tenant_features
  for select using (tenant_id = public.get_current_tenant_id());
create policy tenant_features_insert on public.tenant_features
  for insert with check (tenant_id = public.get_current_tenant_id());
create policy tenant_features_update on public.tenant_features
  for update using (tenant_id = public.get_current_tenant_id())
  with check (tenant_id = public.get_current_tenant_id());

create policy sales_select on public.sales
  for select using (tenant_id = public.get_current_tenant_id());
create policy sales_insert on public.sales
  for insert with check (tenant_id = public.get_current_tenant_id());

create policy sale_items_select on public.sale_items
  for select using (tenant_id = public.get_current_tenant_id());
create policy sale_items_insert on public.sale_items
  for insert with check (tenant_id = public.get_current_tenant_id());

create policy credit_transactions_select on public.credit_transactions
  for select using (tenant_id = public.get_current_tenant_id());
create policy credit_transactions_insert on public.credit_transactions
  for insert with check (tenant_id = public.get_current_tenant_id());

create policy whatsapp_logs_select on public.whatsapp_delivery_logs
  for select using (tenant_id = public.get_current_tenant_id());
create policy whatsapp_logs_insert on public.whatsapp_delivery_logs
  for insert with check (tenant_id = public.get_current_tenant_id());
create policy whatsapp_logs_update on public.whatsapp_delivery_logs
  for update using (tenant_id = public.get_current_tenant_id())
  with check (tenant_id = public.get_current_tenant_id());

create or replace function public.decrement_product_stock(p_product_id uuid, p_quantity int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'invalid_quantity';
  end if;

  update public.products
     set stock_quantity = stock_quantity - p_quantity,
         updated_at = now()
   where id = p_product_id
     and tenant_id = public.get_current_tenant_id();

  if not found then
    raise exception 'product_not_found_or_forbidden';
  end if;
end;
$$;

create or replace function public.increment_customer_debt(p_customer_id uuid, p_amount_cents int)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid;
  v_new_debt integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount';
  end if;

  v_tenant := public.get_current_tenant_id();
  if v_tenant is null then
    raise exception 'tenant_not_found';
  end if;

  update public.customers
     set debt_cents = debt_cents + p_amount_cents,
         updated_at = now()
   where id = p_customer_id
     and tenant_id = v_tenant
  returning debt_cents into v_new_debt;

  if not found then
    raise exception 'customer_not_found_or_forbidden';
  end if;

  insert into public.credit_transactions (
    tenant_id, customer_id, type, amount_cents, balance_after_cents, operator_id, notes
  ) values (
    v_tenant, p_customer_id, 'debit', p_amount_cents, v_new_debt, auth.uid(), 'manual_debit'
  );

  return v_new_debt;
end;
$$;

create or replace function public.settle_customer_debt(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_operator_id uuid,
  p_amount_cents int,
  p_notes text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_tenant uuid;
  v_balance integer;
  v_applied integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'invalid_amount';
  end if;

  v_current_tenant := public.get_current_tenant_id();
  if v_current_tenant is null or v_current_tenant <> p_tenant_id then
    raise exception 'tenant_mismatch';
  end if;

  select debt_cents
    into v_balance
    from public.customers
   where id = p_customer_id
     and tenant_id = p_tenant_id
     for update;

  if not found then
    raise exception 'customer_not_found_or_forbidden';
  end if;

  v_applied := least(p_amount_cents, v_balance);
  if v_applied <= 0 then
    return 0;
  end if;

  update public.customers
     set debt_cents = greatest(debt_cents - v_applied, 0),
         updated_at = now()
   where id = p_customer_id
     and tenant_id = p_tenant_id
  returning debt_cents into v_balance;

  insert into public.credit_transactions (
    tenant_id, customer_id, type, amount_cents, balance_after_cents, operator_id, notes
  ) values (
    p_tenant_id, p_customer_id, 'payment', v_applied, v_balance,
    coalesce(p_operator_id, auth.uid()), p_notes
  );

  return v_applied;
end;
$$;

create or replace function public.checkout_sale(
  p_tenant_id uuid,
  p_operator_id uuid,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_customer_id uuid default null,
  p_tendered_cents integer default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stock_block boolean := false;
  v_sale_id uuid;
  v_subtotal integer := 0;
  v_line_sub integer;
  v_row jsonb;
  v_product record;
  v_qty integer;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_debt_before integer := 0;
  v_debt_after integer := 0;
  v_credit_limit integer := 0;
  v_issued timestamptz := now();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_current_tenant_id() then
    raise exception 'tenant_mismatch';
  end if;
  if p_operator_id is null then
    raise exception 'operator_required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart';
  end if;
  if p_payment_method not in ('cash', 'credit') then
    raise exception 'invalid_payment_method';
  end if;
  if p_payment_method = 'credit' and p_customer_id is null then
    raise exception 'customer_required_for_credit';
  end if;
  if p_payment_method = 'cash' and p_tendered_cents is not null and p_tendered_cents < 0 then
    raise exception 'invalid_tendered_amount';
  end if;

  select coalesce(tf.stock_block, false)
    into v_stock_block
    from public.tenant_features tf
   where tf.tenant_id = p_tenant_id;

  for v_row in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_row ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_quantity';
    end if;

    select * into v_product
      from public.products
     where id = (v_row ->> 'product_id')::uuid
       and tenant_id = p_tenant_id
       for update;

    if not found then
      raise exception 'product_not_found';
    end if;
    if not v_product.is_active then
      raise exception 'product_inactive';
    end if;
    if v_stock_block and v_product.stock_quantity < v_qty then
      raise exception 'insufficient_stock';
    end if;

    v_line_sub := v_product.sale_price_cents * v_qty;
    v_subtotal := v_subtotal + v_line_sub;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'name', v_product.name,
      'barcode', v_product.barcode,
      'category', v_product.category,
      'unit', v_product.unit,
      'quantity', v_qty,
      'unit_price_cents', v_product.sale_price_cents,
      'subtotal_cents', v_line_sub,
      'min_stock_alert', v_product.min_stock_alert,
      'stock_before', v_product.stock_quantity,
      'stock_after', v_product.stock_quantity - v_qty
    ));
  end loop;

  if p_payment_method = 'credit' then
    select debt_cents, credit_limit_cents
      into v_debt_before, v_credit_limit
      from public.customers
     where id = p_customer_id
       and tenant_id = p_tenant_id
       for update;

    if not found then
      raise exception 'customer_not_found_or_forbidden';
    end if;

    v_debt_after := v_debt_before + v_subtotal;
    if v_credit_limit > 0 and v_debt_after > v_credit_limit then
      raise exception 'credit_limit_exceeded';
    end if;
  end if;

  insert into public.sales (
    tenant_id, operator_id, customer_id, payment_method, subtotal_cents,
    credited_cents, tendered_cents, change_cents, notes, created_at
  ) values (
    p_tenant_id, p_operator_id,
    case when p_payment_method = 'credit' then p_customer_id else null end,
    p_payment_method, v_subtotal,
    case when p_payment_method = 'credit' then v_subtotal else 0 end,
    case when p_payment_method = 'cash' then p_tendered_cents else null end,
    case when p_payment_method = 'cash' and p_tendered_cents is not null
         then greatest(p_tendered_cents - v_subtotal, 0) else null end,
    p_notes, v_issued
  )
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    update public.products
       set stock_quantity = stock_quantity - (v_line ->> 'quantity')::integer,
           updated_at = now()
     where id = (v_line ->> 'product_id')::uuid
       and tenant_id = p_tenant_id;

    insert into public.sale_items (
      tenant_id, sale_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents
    ) values (
      p_tenant_id,
      v_sale_id,
      (v_line ->> 'product_id')::uuid,
      v_line ->> 'name',
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price_cents')::integer,
      (v_line ->> 'subtotal_cents')::integer
    );
  end loop;

  if p_payment_method = 'credit' then
    update public.customers
       set debt_cents = v_debt_after,
           updated_at = now()
     where id = p_customer_id
       and tenant_id = p_tenant_id;

    insert into public.credit_transactions (
      tenant_id, customer_id, sale_id, type, amount_cents,
      balance_after_cents, operator_id, notes
    ) values (
      p_tenant_id, p_customer_id, v_sale_id, 'debit', v_subtotal,
      v_debt_after, p_operator_id, coalesce(p_notes, 'sale')
    );
  end if;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'payment_method', p_payment_method,
    'subtotal_cents', v_subtotal,
    'credited_cents', case when p_payment_method = 'credit' then v_subtotal else 0 end,
    'tendered_cents', case when p_payment_method = 'cash' then p_tendered_cents else null end,
    'change_cents', case when p_payment_method = 'cash' and p_tendered_cents is not null
                         then greatest(p_tendered_cents - v_subtotal, 0) else null end,
    'debt_before_cents', v_debt_before,
    'debt_after_cents', v_debt_after,
    'customer_id', p_customer_id,
    'items', v_lines,
    'issued_at', to_char(v_issued at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'notes', p_notes
  );
end;
$$;

grant execute on function public.get_current_tenant_id() to authenticated, service_role;
grant execute on function public.decrement_product_stock(uuid, int) to authenticated, service_role;
grant execute on function public.increment_customer_debt(uuid, int) to authenticated, service_role;
grant execute on function public.settle_customer_debt(uuid, uuid, uuid, int, text) to authenticated, service_role;
grant execute on function public.checkout_sale(uuid, uuid, jsonb, text, uuid, integer, text) to authenticated, service_role;
