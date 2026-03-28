create extension if not exists pgcrypto;

create type public.business_profile as enum ('appointments', 'rooms', 'resources');
create type public.app_role as enum ('owner', 'manager', 'operator');
create type public.booking_status as enum ('draft', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');
create type public.payment_status as enum ('pending', 'authorized', 'paid', 'refunded');
create type public.booking_channel as enum ('admin', 'web');
create type public.notification_channel as enum ('email', 'sms', 'whatsapp');
create type public.audit_entity as enum ('booking', 'payment', 'tenant');

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/Rome',
  currency text not null default 'EUR',
  locale text not null default 'it-IT',
  primary_profile public.business_profile not null default 'appointments',
  enabled_profiles public.business_profile[] not null default array['appointments']::public.business_profile[],
  support_email text,
  booking_lead_hours integer not null default 2 check (booking_lead_hours >= 0),
  booking_interval_minutes integer not null default 30 check (booking_interval_minutes > 0),
  default_deposit_percentage integer not null default 30 check (default_deposit_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'operator',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile public.business_profile not null,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile public.business_profile not null,
  full_name text not null,
  role public.app_role not null default 'operator',
  accent_color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_locations (
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (staff_member_id, location_id)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  profile public.business_profile not null,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  price_cents integer not null check (price_cents >= 0),
  deposit_type text not null default 'percentage' check (deposit_type in ('none', 'percentage', 'fixed')),
  deposit_value integer not null default 0 check (deposit_value >= 0),
  online_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete cascade,
  profile public.business_profile not null,
  weekday integer not null check (weekday between 0 and 6),
  start_minutes integer not null check (start_minutes between 0 and 1439),
  end_minutes integer not null check (end_minutes between 1 and 1440 and end_minutes > start_minutes),
  created_at timestamptz not null default now()
);

create table public.blackouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete cascade,
  profile public.business_profile not null,
  blackout_date date not null,
  start_minutes integer not null check (start_minutes between 0 and 1439),
  end_minutes integer not null check (end_minutes between 1 and 1440 and end_minutes > start_minutes),
  reason text,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  profile public.business_profile not null,
  status public.booking_status not null default 'confirmed',
  payment_status public.payment_status not null default 'pending',
  channel public.booking_channel not null default 'admin',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  deposit_required_cents integer not null default 0 check (deposit_required_cents >= 0),
  deposit_collected_cents integer not null default 0 check (deposit_collected_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  duration_minutes integer not null check (duration_minutes > 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider text not null default 'stripe',
  status public.payment_status not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  checkout_session_id text,
  payment_intent_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  channel public.notification_channel not null,
  recipient text not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  template_key text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_label text not null,
  entity_type public.audit_entity not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index bookings_tenant_starts_at_idx on public.bookings (tenant_id, starts_at);
create index payments_tenant_status_idx on public.payments (tenant_id, status);
create index customers_tenant_email_idx on public.customers (tenant_id, email);
create index availability_rules_tenant_weekday_idx on public.availability_rules (tenant_id, weekday);
create index blackouts_tenant_date_idx on public.blackouts (tenant_id, blackout_date);

create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_tenant(target_tenant uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant
      and membership.user_id = auth.uid()
      and membership.role in ('owner', 'manager')
  );
$$;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.locations enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_locations enable row level security;
alter table public.services enable row level security;
alter table public.customers enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blackouts enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.payments enable row level security;
alter table public.notification_logs enable row level security;
alter table public.audit_events enable row level security;

create policy "tenant members can read tenants"
on public.tenants for select
using (public.is_tenant_member(id));

create policy "tenant owners can update tenants"
on public.tenants for update
using (public.can_manage_tenant(id))
with check (public.can_manage_tenant(id));

create policy "members can read memberships"
on public.tenant_memberships for select
using (public.is_tenant_member(tenant_id));

create policy "owners can manage memberships"
on public.tenant_memberships for all
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

create policy "members can read locations"
on public.locations for select
using (public.is_tenant_member(tenant_id));

create policy "managers can manage locations"
on public.locations for all
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

create policy "members can read staff"
on public.staff_members for select
using (public.is_tenant_member(tenant_id));

create policy "managers can manage staff"
on public.staff_members for all
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

create policy "members can read staff_locations"
on public.staff_locations for select
using (
  exists (
    select 1
    from public.staff_members staff
    where staff.id = staff_locations.staff_member_id
      and public.is_tenant_member(staff.tenant_id)
  )
);

create policy "managers can manage staff_locations"
on public.staff_locations for all
using (
  exists (
    select 1
    from public.staff_members staff
    where staff.id = staff_locations.staff_member_id
      and public.can_manage_tenant(staff.tenant_id)
  )
)
with check (
  exists (
    select 1
    from public.staff_members staff
    where staff.id = staff_locations.staff_member_id
      and public.can_manage_tenant(staff.tenant_id)
  )
);

create policy "members can read services"
on public.services for select
using (public.is_tenant_member(tenant_id));

create policy "managers can manage services"
on public.services for all
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

create policy "members can read customers"
on public.customers for select
using (public.is_tenant_member(tenant_id));

create policy "operators can manage customers"
on public.customers for all
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "members can read availability_rules"
on public.availability_rules for select
using (public.is_tenant_member(tenant_id));

create policy "managers can manage availability_rules"
on public.availability_rules for all
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

create policy "members can read blackouts"
on public.blackouts for select
using (public.is_tenant_member(tenant_id));

create policy "managers can manage blackouts"
on public.blackouts for all
using (public.can_manage_tenant(tenant_id))
with check (public.can_manage_tenant(tenant_id));

create policy "members can read bookings"
on public.bookings for select
using (public.is_tenant_member(tenant_id));

create policy "operators can manage bookings"
on public.bookings for all
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "members can read booking_items"
on public.booking_items for select
using (public.is_tenant_member(tenant_id));

create policy "operators can manage booking_items"
on public.booking_items for all
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "members can read payments"
on public.payments for select
using (public.is_tenant_member(tenant_id));

create policy "operators can manage payments"
on public.payments for all
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "members can read notification_logs"
on public.notification_logs for select
using (public.is_tenant_member(tenant_id));

create policy "operators can manage notification_logs"
on public.notification_logs for all
using (public.is_tenant_member(tenant_id))
with check (public.is_tenant_member(tenant_id));

create policy "members can read audit_events"
on public.audit_events for select
using (public.is_tenant_member(tenant_id));

create policy "operators can insert audit_events"
on public.audit_events for insert
with check (public.is_tenant_member(tenant_id));
