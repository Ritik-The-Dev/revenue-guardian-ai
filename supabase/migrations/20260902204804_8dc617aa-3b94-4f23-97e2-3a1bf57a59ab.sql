create type public.communication_preference as enum ('WHATSAPP', 'EMAIL', 'BOTH', 'NONE');
create type public.webhook_processing_status as enum ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE');
create type public.case_status as enum ('NEW', 'ANALYZING', 'ACTION_PLANNED', 'ACTION_EXECUTED', 'WAITING_FOR_OUTCOME', 'RETRY_PENDING', 'RECOVERED', 'ESCALATED', 'STOPPED');
create type public.recovery_action_type as enum ('SEND_PAYMENT_LINK', 'REQUEST_PAYMENT_METHOD_UPDATE', 'SCHEDULE_RETRY', 'SEND_REMINDER', 'ESCALATE', 'WAIT', 'STOP');
create type public.action_status as enum ('PENDING', 'EXECUTING', 'SENT', 'SUCCESS', 'FAILED', 'CANCELLED');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  external_customer_id text unique,
  name text,
  email text,
  phone text,
  lifetime_value numeric not null default 0,
  successful_payments integer not null default 0,
  failed_payments integer not null default 0,
  last_successful_payment_at timestamptz,
  communication_preference public.communication_preference not null default 'BOTH',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to anon, authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "demo customers are manageable" on public.customers for all to anon, authenticated using (true) with check (true);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  razorpay_order_id text unique not null,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric not null,
  currency text not null default 'INR',
  status text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to anon, authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "demo orders are manageable" on public.orders for all to anon, authenticated using (true) with check (true);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  razorpay_payment_id text unique not null,
  razorpay_order_id text,
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric not null,
  currency text not null default 'INR',
  method text,
  status text not null default 'failed',
  error_code text,
  error_description text,
  error_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payments to anon, authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "demo payments are manageable" on public.payments for all to anon, authenticated using (true) with check (true);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  razorpay_event_id text unique not null,
  event_type text not null,
  payload_hash text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  status public.webhook_processing_status not null default 'RECEIVED',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.webhook_events to anon, authenticated;
grant all on public.webhook_events to service_role;
alter table public.webhook_events enable row level security;
create policy "demo webhook events are manageable" on public.webhook_events for all to anon, authenticated using (true) with check (true);

create table public.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade not null,
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status public.case_status not null default 'NEW',
  diagnosis text,
  diagnosis_confidence numeric,
  recoverability_probability numeric,
  recovery_score numeric,
  expected_recovery_value numeric,
  recommended_action public.recovery_action_type,
  approved_action public.recovery_action_type,
  channel text,
  retry_count integer not null default 0,
  outreach_count integer not null default 0,
  next_action_at timestamptz,
  recovered_amount numeric,
  payment_link_url text,
  llm_reason text,
  policy_decision text,
  policy_reason text,
  escalation_reason text,
  stop_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.recovery_cases to anon, authenticated;
grant all on public.recovery_cases to service_role;
alter table public.recovery_cases enable row level security;
create policy "demo recovery cases are manageable" on public.recovery_cases for all to anon, authenticated using (true) with check (true);

create table public.recovery_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.recovery_cases(id) on delete cascade not null,
  action public.recovery_action_type not null,
  channel text,
  status public.action_status not null default 'PENDING',
  provider_message_id text,
  scheduled_for timestamptz,
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (case_id, action)
);
grant select, insert, update, delete on public.recovery_actions to anon, authenticated;
grant all on public.recovery_actions to service_role;
alter table public.recovery_actions enable row level security;
create policy "demo recovery actions are manageable" on public.recovery_actions for all to anon, authenticated using (true) with check (true);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.recovery_cases(id) on delete cascade,
  event_type text not null,
  decision text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.audit_logs to anon, authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "demo audit logs are manageable" on public.audit_logs for all to anon, authenticated using (true) with check (true);

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.recovery_cases(id) on delete cascade unique not null,
  amount numeric not null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  failure text,
  diagnosis text,
  confidence numeric,
  previous_actions jsonb not null default '[]'::jsonb,
  reason text not null,
  recommended_next_step text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.escalations to anon, authenticated;
grant all on public.escalations to service_role;
alter table public.escalations enable row level security;
create policy "demo escalations are manageable" on public.escalations for all to anon, authenticated using (true) with check (true);

create table public.policy_settings (
  id uuid primary key default gen_random_uuid(),
  max_retry_attempts integer not null default 2,
  max_outreach_attempts integer not null default 2,
  cooldown_hours integer not null default 24,
  minimum_recovery_value numeric not null default 100,
  high_value_threshold numeric not null default 25000,
  low_confidence_threshold numeric not null default 0.60,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.policy_settings to anon, authenticated;
grant all on public.policy_settings to service_role;
alter table public.policy_settings enable row level security;
create policy "demo policy settings are manageable" on public.policy_settings for all to anon, authenticated using (true) with check (true);
insert into public.policy_settings (id) values (gen_random_uuid());

create index recovery_cases_status_idx on public.recovery_cases(status);
create index recovery_cases_created_at_idx on public.recovery_cases(created_at desc);
create index audit_logs_case_id_created_at_idx on public.audit_logs(case_id, created_at);
create index payments_order_id_idx on public.payments(razorpay_order_id);
create index orders_customer_id_idx on public.orders(customer_id);

create or replace function public.update_updated_at_column() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create trigger customers_updated_at before update on public.customers for each row execute function public.update_updated_at_column();
create trigger orders_updated_at before update on public.orders for each row execute function public.update_updated_at_column();
create trigger payments_updated_at before update on public.payments for each row execute function public.update_updated_at_column();
create trigger recovery_cases_updated_at before update on public.recovery_cases for each row execute function public.update_updated_at_column();
create trigger policy_settings_updated_at before update on public.policy_settings for each row execute function public.update_updated_at_column();