-- Create enum for user roles
create type public.app_role as enum ('admin', 'user');

-- Create profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

-- Create user_roles table (CRITICAL: separate table for security)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamp with time zone default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

-- Security definer function to check roles (prevents RLS recursion)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Function to check if user is admin
create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin'::app_role)
$$;

-- Add visibility field to teams
alter table public.teams
add column is_public boolean default false;

-- Trigger to create profile on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  
  -- Assign 'user' role by default
  insert into public.user_roles (user_id, role)
  values (new.id, 'user');
  
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS Policies for profiles
create policy "Users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- RLS Policies for user_roles
create policy "Admins can view all roles"
  on public.user_roles for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "Users can view their own role"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can insert roles"
  on public.user_roles for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "Admins can update roles"
  on public.user_roles for update
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "Admins can delete roles"
  on public.user_roles for delete
  to authenticated
  using (public.is_admin(auth.uid()));

-- Update teams RLS policies to include public teams
drop policy if exists "Users can view their own teams" on public.teams;

create policy "Users can view their own teams or public teams"
  on public.teams for select
  to authenticated
  using (
    auth.uid() = user_id 
    or is_public = true
    or public.is_admin(auth.uid())
  );