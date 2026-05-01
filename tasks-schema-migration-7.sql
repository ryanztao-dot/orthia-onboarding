-- Migration 7: tradeshow / conference booth leads.
-- Run after migrations 1–6.

create table if not exists public.tt_booth_leads (
  id                bigserial primary key,
  organization_id   bigint not null references public.tt_organizations(id) on delete cascade,
  created_by        bigint references public.tt_users(id) on delete set null,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null,

  lead_type         text,                              -- 'doctor' | 'front_desk'
  practice_name     text,
  city_state        text,
  pms               text,                              -- Dolphin | Orthotrace | Ortho2 Edge | Cloud 9 | Wave | Other | Don't Know
  practice_type     text,                              -- Ortho only | GP + Ortho | DSO/multilocation
  visitor_role      text,                              -- FD | Office Manager | Doctor | Other
  doctor_visit_at   timestamptz,
  doctor_present    boolean,
  doctor_email      text,
  doctor_phone      text,
  current_solution  text,
  pain_level        smallint check (pain_level is null or (pain_level between 1 and 10)),
  demo_scheduled    boolean,
  demo_date         timestamptz,
  wheel_prize       text,
  heat              text check (heat is null or heat in ('hot','warm','cold')),
  rep               text,                              -- Clarissa | Olyver
  followed_up       boolean not null default false,
  notes             text
);

create index if not exists tt_booth_leads_org_idx
  on public.tt_booth_leads(organization_id, created_at desc);
