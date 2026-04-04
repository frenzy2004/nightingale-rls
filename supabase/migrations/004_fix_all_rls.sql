-- Nuclear RLS fix: drop ALL policies that query the users table from within
-- another table's policy (causing infinite recursion), and recreate them
-- using the SECURITY DEFINER helper functions.

-- ============================================================
-- Step 1: Ensure helper functions exist
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_clinic_id()
RETURNS UUID AS $$
  SELECT clinic_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Step 2: Drop ALL existing policies on users table
-- ============================================================
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Clinicians can view patients in their clinic" ON users;

-- Recreate users policies (safe — no self-reference)
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Clinicians can view patients in their clinic" ON users
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND get_my_clinic_id() = users.clinic_id
  );

-- ============================================================
-- Step 3: Fix clinics table policy (also queries users → recursion)
-- ============================================================
DROP POLICY IF EXISTS "Users can view their clinic" ON clinics;

CREATE POLICY "Users can view their clinic" ON clinics
  FOR SELECT USING (
    get_my_clinic_id() = clinics.id
  );

-- ============================================================
-- Step 4: Fix messages policies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own messages" ON messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON messages;
DROP POLICY IF EXISTS "Clinicians can view messages from patients in their clinic" ON messages;
DROP POLICY IF EXISTS "Clinicians can insert messages for patients in their clinic" ON messages;

CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Clinicians can view messages from patients in their clinic" ON messages
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = messages.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

CREATE POLICY "Clinicians can insert messages for patients in their clinic" ON messages
  FOR INSERT WITH CHECK (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = messages.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

-- ============================================================
-- Step 5: Fix memory_tags policies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own memory tags" ON memory_tags;
DROP POLICY IF EXISTS "Users can insert own memory tags" ON memory_tags;
DROP POLICY IF EXISTS "Users can update own memory tags" ON memory_tags;
DROP POLICY IF EXISTS "Clinicians can view memory tags for patients in their clinic" ON memory_tags;

CREATE POLICY "Users can view own memory tags" ON memory_tags
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own memory tags" ON memory_tags
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own memory tags" ON memory_tags
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Clinicians can view memory tags for patients in their clinic" ON memory_tags
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = memory_tags.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

-- ============================================================
-- Step 6: Fix escalations policies
-- ============================================================
DROP POLICY IF EXISTS "Patients can view own escalations" ON escalations;
DROP POLICY IF EXISTS "Patients can insert own escalations" ON escalations;
DROP POLICY IF EXISTS "Clinicians can view escalations for their clinic" ON escalations;
DROP POLICY IF EXISTS "Clinicians can update escalations for their clinic" ON escalations;

CREATE POLICY "Patients can view own escalations" ON escalations
  FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "Patients can insert own escalations" ON escalations
  FOR INSERT WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Clinicians can view escalations for their clinic" ON escalations
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND escalations.clinic_id = get_my_clinic_id()
  );

CREATE POLICY "Clinicians can update escalations for their clinic" ON escalations
  FOR UPDATE USING (
    get_my_role() IN ('clinician', 'admin')
    AND escalations.clinic_id = get_my_clinic_id()
  );

-- ============================================================
-- Step 7: Fix clinician_replies policies
-- ============================================================
DROP POLICY IF EXISTS "Patients can view replies to their escalations" ON clinician_replies;
DROP POLICY IF EXISTS "Clinicians can view replies in their clinic" ON clinician_replies;
DROP POLICY IF EXISTS "Clinicians can insert replies for their clinic" ON clinician_replies;

CREATE POLICY "Patients can view replies to their escalations" ON clinician_replies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM escalations e
      WHERE e.id = clinician_replies.escalation_id
      AND e.patient_id = auth.uid()
    )
  );

CREATE POLICY "Clinicians can view replies in their clinic" ON clinician_replies
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM escalations e
      WHERE e.id = clinician_replies.escalation_id
      AND e.clinic_id = get_my_clinic_id()
    )
  );

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

-- ============================================================
-- Step 8: Fix experiment_logs policies
-- ============================================================
DROP POLICY IF EXISTS "Users can view own experiment logs" ON experiment_logs;
DROP POLICY IF EXISTS "Service role can insert experiment logs" ON experiment_logs;

CREATE POLICY "Users can view own experiment logs" ON experiment_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can insert experiment logs" ON experiment_logs
  FOR INSERT WITH CHECK (true);
