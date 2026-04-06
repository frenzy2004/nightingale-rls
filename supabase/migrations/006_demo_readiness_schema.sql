CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS provider_name TEXT,
  ADD COLUMN IF NOT EXISTS hospital_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
  ADD COLUMN IF NOT EXISTS primary_clinician_name TEXT,
  ADD COLUMN IF NOT EXISTS primary_specialty TEXT,
  ADD COLUMN IF NOT EXISTS brand_theme JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'chat'
    CHECK (message_type IN ('chat', 'provider_reply', 'consult_summary')),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE escalations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS patient_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age_label TEXT,
  mrn TEXT,
  allergies TEXT[] NOT NULL DEFAULT '{}',
  headline TEXT,
  summary TEXT,
  history_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  recent_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_preferred_language
  ON patient_profiles(preferred_language);

CREATE OR REPLACE FUNCTION update_escalation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS escalation_updated ON escalations;
CREATE TRIGGER escalation_updated
  BEFORE UPDATE ON escalations
  FOR EACH ROW EXECUTE FUNCTION update_escalation_timestamp();

CREATE OR REPLACE FUNCTION update_patient_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patient_profile_updated ON patient_profiles;
CREATE TRIGGER patient_profile_updated
  BEFORE UPDATE ON patient_profiles
  FOR EACH ROW EXECUTE FUNCTION update_patient_profile_timestamp();

ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view own patient profile" ON patient_profiles;
CREATE POLICY "Patients can view own patient profile" ON patient_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Patients can update own patient profile" ON patient_profiles;
CREATE POLICY "Patients can update own patient profile" ON patient_profiles
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Clinicians can view patient profiles for their clinic" ON patient_profiles;
CREATE POLICY "Clinicians can view patient profiles for their clinic" ON patient_profiles
  FOR SELECT USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = patient_profiles.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );

DROP POLICY IF EXISTS "Clinicians can update patient profiles for their clinic" ON patient_profiles;
CREATE POLICY "Clinicians can update patient profiles for their clinic" ON patient_profiles
  FOR UPDATE USING (
    get_my_role() IN ('clinician', 'admin')
    AND EXISTS (
      SELECT 1 FROM users patient
      WHERE patient.id = patient_profiles.user_id
      AND patient.clinic_id = get_my_clinic_id()
    )
  );
