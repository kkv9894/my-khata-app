/*
  # Repair app schema drift

  Aligns the database with the current app behavior:
  - profiles now support shop name + role metadata
  - transactions get a category_label for AI/display use
  - adds staff_access for owner/staff relationships
  - adds udhaar tables for customer credit tracking
*/

alter table profiles
  add column if not exists full_name text default '',
  add column if not exists shop_name text default '',
  add column if not exists role text default 'owner' check (role in ('owner', 'staff')),
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

update profiles
set
  shop_name = case
    when coalesce(shop_name, '') <> '' then shop_name
    when coalesce(business_name, '') <> '' then business_name
    else 'My Khata'
  end,
  full_name = coalesce(full_name, ''),
  role = coalesce(role, 'owner');

alter table transactions
  add column if not exists category_label text;

create table if not exists staff_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  staff_email text not null,
  staff_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table staff_access enable row level security;

drop policy if exists "Owners can view own staff access" on staff_access;
drop policy if exists "Owners can insert own staff access" on staff_access;
drop policy if exists "Owners can update own staff access" on staff_access;
drop policy if exists "Owners can delete own staff access" on staff_access;

create policy "Owners can view own staff access"
  on staff_access for select
  to authenticated
  using (
    auth.uid() = owner_id
    or lower(staff_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or auth.uid() = staff_user_id
  );

create policy "Owners can insert own staff access"
  on staff_access for insert
  to authenticated
  with check (auth.uid() = owner_id);

create policy "Owners can update own staff access"
  on staff_access for update
  to authenticated
  using (auth.uid() = owner_id or auth.uid() = staff_user_id)
  with check (auth.uid() = owner_id or auth.uid() = staff_user_id);

create policy "Owners can delete own staff access"
  on staff_access for delete
  to authenticated
  using (auth.uid() = owner_id);

create table if not exists udhaar_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  total_credit numeric not null default 0,
  total_paid numeric not null default 0,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table udhaar_customers enable row level security;

drop policy if exists "Users can view own udhaar customers" on udhaar_customers;
drop policy if exists "Users can insert own udhaar customers" on udhaar_customers;
drop policy if exists "Users can update own udhaar customers" on udhaar_customers;
drop policy if exists "Users can delete own udhaar customers" on udhaar_customers;

create policy "Users can view own udhaar customers"
  on udhaar_customers for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own udhaar customers"
  on udhaar_customers for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own udhaar customers"
  on udhaar_customers for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own udhaar customers"
  on udhaar_customers for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists udhaar_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references udhaar_customers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('credit', 'payment')),
  amount numeric not null check (amount > 0),
  note text default '',
  created_at timestamptz not null default now()
);

alter table udhaar_transactions enable row level security;

drop policy if exists "Users can view own udhaar transactions" on udhaar_transactions;
drop policy if exists "Users can insert own udhaar transactions" on udhaar_transactions;
drop policy if exists "Users can delete own udhaar transactions" on udhaar_transactions;

create policy "Users can view own udhaar transactions"
  on udhaar_transactions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own udhaar transactions"
  on udhaar_transactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete own udhaar transactions"
  on udhaar_transactions for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists idx_transactions_category_label on transactions(category_label);
create index if not exists idx_staff_access_owner_id on staff_access(owner_id);
create index if not exists idx_staff_access_staff_email on staff_access(lower(staff_email));
create index if not exists idx_udhaar_customers_user_id on udhaar_customers(user_id);
create index if not exists idx_udhaar_transactions_customer_id on udhaar_transactions(customer_id);
