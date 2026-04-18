/*
  # Cleanup orphaned account data

  Removes rows left behind by previously deleted auth users.
  This is a one-time repair for historical data and is safe to run repeatedly.
*/

do $$
begin
  if to_regclass('public.inventory') is not null then
    execute $sql$
      delete from public.inventory i
      where not exists (
        select 1 from auth.users u where u.id = i.user_id
      )
    $sql$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.udhaar_transactions') is not null then
    execute $sql$
      delete from public.udhaar_transactions t
      where not exists (
        select 1 from auth.users u where u.id = t.user_id
      )
    $sql$;
  end if;

  if to_regclass('public.udhaar_customers') is not null then
    execute $sql$
      delete from public.udhaar_customers c
      where not exists (
        select 1 from auth.users u where u.id = c.user_id
      )
    $sql$;
  end if;

  if to_regclass('public.transactions') is not null then
    execute $sql$
      delete from public.transactions t
      where not exists (
        select 1 from auth.users u where u.id = t.user_id
      )
    $sql$;
  end if;

  if to_regclass('public.voice_logs') is not null then
    execute $sql$
      delete from public.voice_logs v
      where not exists (
        select 1 from auth.users u where u.id = v.user_id
      )
    $sql$;
  end if;

  if to_regclass('public.categories') is not null then
    execute $sql$
      delete from public.categories c
      where not exists (
        select 1 from auth.users u where u.id = c.user_id
      )
    $sql$;
  end if;

  if to_regclass('public.staff_access') is not null then
    execute $sql$
      delete from public.staff_access s
      where not exists (
        select 1 from auth.users u where u.id = s.owner_id
      )
      or (
        s.staff_user_id is not null
        and not exists (
          select 1 from auth.users u where u.id = s.staff_user_id
        )
      )
    $sql$;
  end if;

  if to_regclass('public.profiles') is not null then
    execute $sql$
      delete from public.profiles p
      where not exists (
        select 1 from auth.users u where u.id = p.id
      )
    $sql$;
  end if;
end $$;
