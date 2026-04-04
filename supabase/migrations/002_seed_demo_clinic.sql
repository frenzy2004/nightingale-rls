-- ============================================================
-- DEMO SEED: Prototype-only clinic and auto-assignment
-- In production, users would be assigned to clinics through
-- an onboarding flow, not auto-assigned to a single clinic.
-- ============================================================

-- Insert demo clinic
INSERT INTO clinics (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Nightingale Demo Clinic')
ON CONFLICT (id) DO NOTHING;

-- Update handle_new_user to auto-assign all new users to the demo clinic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role, clinic_id)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'patient'),
    '00000000-0000-0000-0000-000000000001'  -- Demo clinic (prototype only)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill any existing users without a clinic_id
UPDATE users
SET clinic_id = '00000000-0000-0000-0000-000000000001'
WHERE clinic_id IS NULL;
