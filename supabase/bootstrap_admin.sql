-- Run once, after the first user has signed up via Supabase Auth.
update public.profiles set role = 'admin' where email = 'lamhieuthuan@gmail.com';
