-- Schools that play AHSAA opponents but are not championship-eligible:
-- independents, AISA programs, anyone off the classification list.
--
-- They are deliberately NOT rows in `teams`. The engine already values any
-- name it does not find in `teams` off the field mean, so absence from that
-- table is what makes a school out-of-state. What was missing is the other
-- half: the importer had no way to tell "Tharptown, an independent" apart
-- from "Hackelburg, a typo", so it skipped both and reported them.
--
-- Listing a name here says "this one is real, import its games as
-- out-of-state" while leaving genuine misspellings to be reported.
--
-- Safe to run more than once.
create table if not exists non_members (
  name       text primary key,
  -- Free text: "independent", "AISA", "not championship-eligible".
  note       text,
  created_at timestamptz not null default now()
);

alter table non_members enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'non_members' and policyname = 'public read non_members'
  ) then
    create policy "public read non_members"
      on non_members for select using (true);
  end if;
end $$;

insert into non_members (name, note) values
  ('Vina',      'Not championship-eligible'),
  ('Tharptown', 'Independent from 2026')
on conflict (name) do nothing;
