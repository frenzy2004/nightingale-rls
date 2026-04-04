-- Fix infinite recursion in users table RLS policy.
-- The "Clinicians can view patients in their clinic" policy queries the users
-- table to check the current user's role and clinic_id, which triggers the
-- same RLS policies recursively.
--
-- Fix: use a SECURITY DEFINER function to bypass RLS when looking up
-- the current user's clinic_id and role.

-- Helper function to get current user's clinic_id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_my_clinic_id()
RETURNS UUID AS $$
  SELECT clinic_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to get current user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Clinicians can view patients in their clinic" ON users;

-- Recreate without recursion
CREATE POLICY "Clinicians can view patients in their clinic" ON users
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND get_my_clinic_id() = users.clinic_id
  );

-- Also fix the same pattern in messages policies
DROP POLICY IF EXISTS "Clinicians can view messages from patients in their clinic" ON messages;
CREATE POLICY "Clinicians can view messages from patients in their clinic" ON messages
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = messages.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

DROP POLICY IF EXISTS "Clinicians can insert messages for patients in their clinic" ON messages;
CREATE POLICY "Clinicians can insert messages for patients in their clinic" ON messages
  FOR INSERT WITH CHECK (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = messages.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

-- Fix memory_tags clinician policy
DROP POLICY IF EXISTS "Clinicians can view memory tags for patients in their clinic" ON memory_tags;
CREATE POLICY "Clinicians can view memory tags for patients in their clinic" ON memory_tags
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = memory_tags.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

-- Fix escalations clinician policies
DROP POLICY IF EXISTS "Clinicians can view escalations for their clinic" ON escalations;
CREATE POLICY "Clinicians can view escalations for their clinic" ON escalations
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND escalations.clinic_id = get_my_clinic_id()
  );

DROP POLICY IF EXISTS "Clinicians can update escalations for their clinic" ON escalations;
CREATE POLICY "Clinicians can update escalations for their clinic" ON escalations
  FOR UPDATE USING (
    get_my_role() IN ('clinician', 'admin')
    AND escalations.clinic_id = get_my_clinic_id()
  );

-- Fix clinician_replies policies
DROP POLICY IF EXISTS "Clinicians can view replies in their clinic" ON clinician_replies;
CREATE POLICY "Clinicians can view replies in their clinic" ON clinician_replies
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM escalations e
      WHERE e.id = clinician_replies.escalation_id
      AND e.clinic_id = get_my_clinic_id()
    )
  );

DROP POLICY IF EXISTS "Clinicians can insert replies for their clinic" ON clinician_replies;
CREATE POLICY "Clinicians can insert replies for their clinic" ON clinician_replies
  FOR INSERT WITH CHECK (
    get_my_role() IN ('clinician', 'admin')
    AND clinician_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM escalations e
      WHERE e.id = clinician_replies.escalation_id
      AND e.clinic_id = get_my_clinic_id()
    )
  );
