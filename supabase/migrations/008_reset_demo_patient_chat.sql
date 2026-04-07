DO $$
DECLARE
  demo_patient_id UUID;
BEGIN
  SELECT id
    INTO demo_patient_id
  FROM users
  WHERE email = 'demo.patient@nightingale.health'
  LIMIT 1;

  IF demo_patient_id IS NULL THEN
    RETURN;
  END IF;

  -- Keep patient profile and memory tags, but clear the chat thread and
  -- associated escalation state so the demo patient starts fresh.
  DELETE FROM escalations
  WHERE patient_id = demo_patient_id;

  DELETE FROM messages
  WHERE user_id = demo_patient_id;
END $$;
