-- RPC function to get current user's full profile, bypassing RLS.
-- This avoids the infinite recursion issue when querying the users table.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.users AS $$
  SELECT * FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;
