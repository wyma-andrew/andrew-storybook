-- Admin becomes a column so it can be granted from /admin instead of an env
-- var and a redeploy. ADMIN_EMAILS stays in the code as break-glass — see
-- history/admin-users.md — so there is no way to lock every admin out of the
-- one page that grants admin.

alter table profiles add column is_admin boolean not null default false;

-- The addresses that were admins by env var before this migration. An address
-- with no account yet matches nothing; it is granted from /admin once the
-- account exists.
update profiles set is_admin = true, updated_at = now()
  where lower(email) in ('info.wyma@gmail.com', 'admin@gmail.com');
