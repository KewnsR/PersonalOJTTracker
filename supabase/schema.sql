create table users (
  id varchar(255) primary key,
  name varchar(255) not null default 'OJT Trainee',
  email varchar(255) not null unique,
  username varchar(255) not null unique,
  auth_provider varchar(50) not null default 'google',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table entries (
  id bigint generated always as identity primary key,
  user_id varchar(255) not null references users(id) on delete cascade,
  date varchar(20) not null,
  time_in varchar(20) not null,
  time_out varchar(20) not null,
  hours numeric(6,2) not null,
  notes varchar(5000) not null default '',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create index idx_entries_user_date on entries (user_id, date);

create table user_preferences (
  user_id varchar(255) primary key references users(id) on delete cascade,
  lunch_start_hour integer not null default 11,
  lunch_end_hour integer not null default 12,
  required_ojt_hours integer not null default 600,
  weekly_journal_notes json not null default '{}',
  theme_mode varchar(50) not null default 'light',
  updated_at timestamp not null default current_timestamp
);

create table user_profile (
  user_id varchar(255) primary key references users(id) on delete cascade,
  name varchar(255) not null default 'OJT Trainee',
  position varchar(255) not null default '',
  company varchar(255) not null default '',
  email varchar(255) not null default '',
  department varchar(255) not null default '',
  supervisor varchar(255) not null default '',
  updated_at timestamp not null default current_timestamp
);

-- Row-level security setup for all public tables exposed to PostgREST.
alter table users enable row level security;
alter table entries enable row level security;
alter table user_preferences enable row level security;
alter table user_profile enable row level security;

-- users: each authenticated user can access and modify only their own row.
drop policy if exists users_select_own on users;
create policy users_select_own
on users
for select
using (
  id = auth.uid()::text
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists users_insert_own on users;
create policy users_insert_own
on users
for insert
with check (
  id = auth.uid()::text
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists users_update_own on users;
create policy users_update_own
on users
for update
using (
  id = auth.uid()::text
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  id = auth.uid()::text
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists users_delete_own on users;
create policy users_delete_own
on users
for delete
using (id = auth.uid()::text);

-- entries: each authenticated user can CRUD only their own timesheet rows.
drop policy if exists entries_select_own on entries;
create policy entries_select_own
on entries
for select
using (
  exists (
    select 1
    from users u
    where u.id = entries.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists entries_insert_own on entries;
create policy entries_insert_own
on entries
for insert
with check (
  exists (
    select 1
    from users u
    where u.id = entries.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists entries_update_own on entries;
create policy entries_update_own
on entries
for update
using (
  exists (
    select 1
    from users u
    where u.id = entries.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
)
with check (
  exists (
    select 1
    from users u
    where u.id = entries.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists entries_delete_own on entries;
create policy entries_delete_own
on entries
for delete
using (
  exists (
    select 1
    from users u
    where u.id = entries.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

-- user_preferences: each authenticated user can access and modify only their own preferences.
drop policy if exists user_preferences_select_own on user_preferences;
create policy user_preferences_select_own
on user_preferences
for select
using (
  exists (
    select 1
    from users u
    where u.id = user_preferences.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists user_preferences_insert_own on user_preferences;
create policy user_preferences_insert_own
on user_preferences
for insert
with check (
  exists (
    select 1
    from users u
    where u.id = user_preferences.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists user_preferences_update_own on user_preferences;
create policy user_preferences_update_own
on user_preferences
for update
using (
  exists (
    select 1
    from users u
    where u.id = user_preferences.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
)
with check (
  exists (
    select 1
    from users u
    where u.id = user_preferences.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists user_preferences_delete_own on user_preferences;
create policy user_preferences_delete_own
on user_preferences
for delete
using (
  exists (
    select 1
    from users u
    where u.id = user_preferences.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

-- user_profile: each authenticated user can access and modify only their own profile.
drop policy if exists user_profile_select_own on user_profile;
create policy user_profile_select_own
on user_profile
for select
using (
  exists (
    select 1
    from users u
    where u.id = user_profile.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists user_profile_insert_own on user_profile;
create policy user_profile_insert_own
on user_profile
for insert
with check (
  exists (
    select 1
    from users u
    where u.id = user_profile.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists user_profile_update_own on user_profile;
create policy user_profile_update_own
on user_profile
for update
using (
  exists (
    select 1
    from users u
    where u.id = user_profile.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
)
with check (
  exists (
    select 1
    from users u
    where u.id = user_profile.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);

drop policy if exists user_profile_delete_own on user_profile;
create policy user_profile_delete_own
on user_profile
for delete
using (
  exists (
    select 1
    from users u
    where u.id = user_profile.user_id
      and (
        u.id = auth.uid()::text
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
);
