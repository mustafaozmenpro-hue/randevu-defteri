-- Randevu Defteri veritabanı kurulumu
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştırıp Run.

create table if not exists public.randevular (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  date             date not null,
  time             text,
  who              text,
  phone            text,
  place            text,
  cat              text not null default 'İş',
  remind           integer not null default 1440,
  status           text not null default 'bekliyor' check (status in ('bekliyor', 'tamam', 'iptal')),
  note             text,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_by_email text default (auth.jwt() ->> 'email'),
  updated_by_email text default (auth.jwt() ->> 'email'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists randevular_date_idx on public.randevular (date);

-- Her güncellemede kimin ve ne zaman değiştirdiğini kaydet
create or replace function public.randevular_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by_email := coalesce(auth.jwt() ->> 'email', new.updated_by_email);
  return new;
end;
$$;

drop trigger if exists randevular_touch on public.randevular;
create trigger randevular_touch
  before update on public.randevular
  for each row execute function public.randevular_touch();

-- Erişim: yalnızca giriş yapmış ekip üyeleri okuyup yazabilir.
-- Yeni kayıt (sign up) kapalı tutulur; ekip üyeleri panelden davet edilir.
alter table public.randevular enable row level security;

drop policy if exists "Ekip okur" on public.randevular;
drop policy if exists "Ekip ekler" on public.randevular;
drop policy if exists "Ekip günceller" on public.randevular;
drop policy if exists "Ekip siler" on public.randevular;

create policy "Ekip okur"      on public.randevular for select to authenticated using (true);
create policy "Ekip ekler"     on public.randevular for insert to authenticated with check (true);
create policy "Ekip günceller" on public.randevular for update to authenticated using (true) with check (true);
create policy "Ekip siler"     on public.randevular for delete to authenticated using (true);

-- Bir kişinin yaptığı değişiklik diğerlerinin ekranına anında düşsün
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'randevular'
  ) then
    alter publication supabase_realtime add table public.randevular;
  end if;
end;
$$;
