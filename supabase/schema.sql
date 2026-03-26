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
  theme_mode varchar(50) not null default 'dark',
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

-- Optional row-level security setup (recommended if not using service-role only):
-- alter table users enable row level security;
-- alter table entries enable row level security;
-- alter table user_preferences enable row level security;
-- alter table user_profile enable row level security;
