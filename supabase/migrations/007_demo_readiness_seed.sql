CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  demo_clinic_id CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  clinician_id UUID := '00000000-0000-0000-0000-000000000101';
  patient_a UUID := '00000000-0000-0000-0000-000000000201';
  patient_b UUID := '00000000-0000-0000-0000-000000000202';
  patient_c UUID := '00000000-0000-0000-0000-000000000203';
  patient_d UUID := '00000000-0000-0000-0000-000000000204';
  patient_e UUID := '00000000-0000-0000-0000-000000000205';
  default_password TEXT := crypt('NightingaleDemo2025!', gen_salt('bf'));
BEGIN
  SELECT id INTO clinician_id
  FROM auth.users
  WHERE email = 'demo.doctor@nightingale.health'
  LIMIT 1;

  IF clinician_id IS NULL THEN
    clinician_id := '00000000-0000-0000-0000-000000000101';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      clinician_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'demo.doctor@nightingale.health', default_password, NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Dr Alan Teh","role":"clinician"}',
      NOW(), NOW(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = default_password,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"full_name":"Dr Alan Teh","role":"clinician"}',
        updated_at = NOW()
    WHERE id = clinician_id;
  END IF;

  SELECT id INTO patient_a
  FROM auth.users
  WHERE email = 'demo.patient@nightingale.health'
  LIMIT 1;

  IF patient_a IS NULL THEN
    patient_a := '00000000-0000-0000-0000-000000000201';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      patient_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'demo.patient@nightingale.health', default_password, NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Nadia Rahman","role":"patient"}',
      NOW(), NOW(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = default_password,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"full_name":"Nadia Rahman","role":"patient"}',
        updated_at = NOW()
    WHERE id = patient_a;
  END IF;

  SELECT id INTO patient_b
  FROM auth.users
  WHERE email = 'lydia.ong@nightingale.health'
  LIMIT 1;

  IF patient_b IS NULL THEN
    patient_b := '00000000-0000-0000-0000-000000000202';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      patient_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'lydia.ong@nightingale.health', default_password, NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Lydia Ong","role":"patient"}',
      NOW(), NOW(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = default_password,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"full_name":"Lydia Ong","role":"patient"}',
        updated_at = NOW()
    WHERE id = patient_b;
  END IF;

  SELECT id INTO patient_c
  FROM auth.users
  WHERE email = 'harith.jamal@nightingale.health'
  LIMIT 1;

  IF patient_c IS NULL THEN
    patient_c := '00000000-0000-0000-0000-000000000203';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      patient_c, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'harith.jamal@nightingale.health', default_password, NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Harith Jamal","role":"patient"}',
      NOW(), NOW(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = default_password,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"full_name":"Harith Jamal","role":"patient"}',
        updated_at = NOW()
    WHERE id = patient_c;
  END IF;

  SELECT id INTO patient_d
  FROM auth.users
  WHERE email = 'sara.lee@nightingale.health'
  LIMIT 1;

  IF patient_d IS NULL THEN
    patient_d := '00000000-0000-0000-0000-000000000204';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      patient_d, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'sara.lee@nightingale.health', default_password, NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Sara Lee","role":"patient"}',
      NOW(), NOW(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = default_password,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"full_name":"Sara Lee","role":"patient"}',
        updated_at = NOW()
    WHERE id = patient_d;
  END IF;

  SELECT id INTO patient_e
  FROM auth.users
  WHERE email = 'arjun.nair@nightingale.health'
  LIMIT 1;

  IF patient_e IS NULL THEN
    patient_e := '00000000-0000-0000-0000-000000000205';
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    VALUES (
      patient_e, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'arjun.nair@nightingale.health', default_password, NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Arjun Nair","role":"patient"}',
      NOW(), NOW(), '', '', '', ''
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = default_password,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}',
        raw_user_meta_data = '{"full_name":"Arjun Nair","role":"patient"}',
        updated_at = NOW()
    WHERE id = patient_e;
  END IF;

  INSERT INTO clinics (
    id,
    name,
    provider_name,
    hospital_name,
    emergency_phone,
    primary_clinician_name,
    primary_specialty,
    brand_theme
  )
  VALUES (
    demo_clinic_id,
    'Nightingale Demo Clinic',
    'Asia OneHealthCare',
    'SJMC',
    '999',
    'Dr Alan Teh',
    'Oncology',
    '{
      "primary":"#0F6C5D",
      "accent":"#F2B948",
      "surface":"#F7FBFA",
      "ink":"#123036"
    }'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
    SET provider_name = EXCLUDED.provider_name,
        hospital_name = EXCLUDED.hospital_name,
        emergency_phone = EXCLUDED.emergency_phone,
        primary_clinician_name = EXCLUDED.primary_clinician_name,
        primary_specialty = EXCLUDED.primary_specialty,
        brand_theme = EXCLUDED.brand_theme;

  INSERT INTO users (id, email, full_name, role, clinic_id)
  VALUES
    (clinician_id, 'demo.doctor@nightingale.health', 'Dr Alan Teh', 'clinician', demo_clinic_id),
    (patient_a, 'demo.patient@nightingale.health', 'Nadia Rahman', 'patient', demo_clinic_id),
    (patient_b, 'lydia.ong@nightingale.health', 'Lydia Ong', 'patient', demo_clinic_id),
    (patient_c, 'harith.jamal@nightingale.health', 'Harith Jamal', 'patient', demo_clinic_id),
    (patient_d, 'sara.lee@nightingale.health', 'Sara Lee', 'patient', demo_clinic_id),
    (patient_e, 'arjun.nair@nightingale.health', 'Arjun Nair', 'patient', demo_clinic_id)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        clinic_id = EXCLUDED.clinic_id;

  INSERT INTO patient_profiles (
    user_id,
    age_label,
    mrn,
    allergies,
    headline,
    summary,
    history_stats,
    recent_history,
    preferred_language
  )
  VALUES
    (
      patient_a,
      '52 years',
      'SJMC-240318',
      ARRAY['Penicillin', 'Shellfish'],
      'Breast cancer follow-up, post-biopsy planning',
      'Prefers concise instructions, usually messages late evening, worried about procedure prep and nausea after treatment.',
      '{"last_visit":"2 days ago","risk_profile":"Moderate","care_program":"Oncology fast-track","last_question":"Biopsy preparation"}'::jsonb,
      '["Biopsy booked for Thursday morning","Stopped OTC pain relief last week","Family member accompanies visits"]'::jsonb,
      'en'
    ),
    (
      patient_b,
      '38 years',
      'SJMC-240411',
      ARRAY['None documented'],
      'Recurring migraines with childcare constraints',
      'Often asks short practical questions about symptom timing and medication side effects.',
      '{"last_visit":"1 week ago","risk_profile":"Low","care_program":"General medicine","last_question":"Morning headaches"}'::jsonb,
      '["Headaches worse before breakfast","Uses Panadol occasionally","Needs school-hour appointments"]'::jsonb,
      'en'
    ),
    (
      patient_c,
      '61 years',
      'SJMC-240512',
      ARRAY['Aspirin'],
      'Post-infusion fatigue and appetite changes',
      'Tracks symptoms closely and usually includes timing details.',
      '{"last_visit":"Yesterday","risk_profile":"High","care_program":"Oncology day care","last_question":"Breathlessness after infusion"}'::jsonb,
      '["Fatigue increased after last infusion","Mild shortness of breath on stairs","Lives 45 minutes from SJMC"]'::jsonb,
      'en'
    ),
    (
      patient_d,
      '44 years',
      'SJMC-240619',
      ARRAY['Latex'],
      'Follow-up on medication timing and nausea',
      'Usually asks about home symptom management and follow-up timing.',
      '{"last_visit":"3 days ago","risk_profile":"Moderate","care_program":"Medical oncology","last_question":"Nausea after tablets"}'::jsonb,
      '["Morning nausea after tablets","Keeping a meal log","Prefers WhatsApp-style updates"]'::jsonb,
      'en'
    ),
    (
      patient_e,
      '29 years',
      'SJMC-240777',
      ARRAY['None documented'],
      'Young adult with neck lump concern and urgent anxiety',
      'Needs clear escalation guidance and reassurance grounded in next steps.',
      '{"last_visit":"Today","risk_profile":"High","care_program":"Rapid access","last_question":"New neck lump"}'::jsonb,
      '["Noticed lump this morning","No prior oncology history","Wants earliest available appointment"]'::jsonb,
      'en'
    )
  ON CONFLICT (user_id) DO UPDATE
    SET age_label = EXCLUDED.age_label,
        mrn = EXCLUDED.mrn,
        allergies = EXCLUDED.allergies,
        headline = EXCLUDED.headline,
        summary = EXCLUDED.summary,
        history_stats = EXCLUDED.history_stats,
        recent_history = EXCLUDED.recent_history,
        preferred_language = EXCLUDED.preferred_language,
        updated_at = NOW();

  INSERT INTO messages (id, user_id, conversation_id, content, sender, authority, language, message_type, metadata, created_at)
  VALUES
    ('00000000-0000-0000-0000-000000001001', patient_a, '10000000-0000-0000-0000-000000000001', 'How should I get ready for my biopsy on Thursday?', 'patient', 'ai_generated', 'en', 'chat', '{}'::jsonb, NOW() - INTERVAL '18 hours'),
    ('00000000-0000-0000-0000-000000001002', patient_a, '10000000-0000-0000-0000-000000000001', 'Bring a medication list, avoid any fasting changes unless your care team has told you to, and wear something easy to change out of. If you notice new heavy bleeding or feel faint, contact SJMC urgently.', 'ai', 'ai_generated', 'en', 'chat', '{"riskLevel":"medium"}'::jsonb, NOW() - INTERVAL '18 hours' + INTERVAL '2 minutes'),
    ('00000000-0000-0000-0000-000000001003', patient_a, '10000000-0000-0000-0000-000000000001', 'Can the care team tell me if I need to stop Panadol?', 'patient', 'ai_generated', 'en', 'chat', '{}'::jsonb, NOW() - INTERVAL '17 hours'),
    ('00000000-0000-0000-0000-000000001004', patient_b, '10000000-0000-0000-0000-000000000002', 'My headaches are worse in the morning. Is that something I should worry about?', 'patient', 'ai_generated', 'en', 'chat', '{}'::jsonb, NOW() - INTERVAL '14 hours'),
    ('00000000-0000-0000-0000-000000001005', patient_c, '10000000-0000-0000-0000-000000000003', 'I feel more breathless than usual after today''s infusion.', 'patient', 'ai_generated', 'en', 'chat', '{}'::jsonb, NOW() - INTERVAL '5 hours'),
    ('00000000-0000-0000-0000-000000001006', patient_d, '10000000-0000-0000-0000-000000000004', 'The nausea after my tablets is lasting most of the morning.', 'patient', 'ai_generated', 'en', 'chat', '{}'::jsonb, NOW() - INTERVAL '9 hours'),
    ('00000000-0000-0000-0000-000000001007', patient_e, '10000000-0000-0000-0000-000000000005', 'I found a hard lump on my neck today and now I''m scared.', 'patient', 'ai_generated', 'en', 'chat', '{}'::jsonb, NOW() - INTERVAL '2 hours')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO memory_tags (id, message_id, user_id, value, tags, status, authority, source_message_id, created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001003', patient_a, 'takes Panadol occasionally', ARRAY['#medication'], 'stopped', 'ai_extracted', '00000000-0000-0000-0000-000000001003', NOW() - INTERVAL '17 hours', NOW() - INTERVAL '17 hours'),
    ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001004', patient_b, 'morning headaches', ARRAY['#symptom'], 'active', 'ai_extracted', '00000000-0000-0000-0000-000000001004', NOW() - INTERVAL '14 hours', NOW() - INTERVAL '14 hours'),
    ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001005', patient_c, 'more breathless after infusion', ARRAY['#symptom'], 'flagged', 'ai_extracted', '00000000-0000-0000-0000-000000001005', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '5 hours'),
    ('00000000-0000-0000-0000-000000002004', '00000000-0000-0000-0000-000000001006', patient_d, 'morning nausea after tablets', ARRAY['#symptom'], 'active', 'ai_extracted', '00000000-0000-0000-0000-000000001006', NOW() - INTERVAL '9 hours', NOW() - INTERVAL '9 hours'),
    ('00000000-0000-0000-0000-000000002005', '00000000-0000-0000-0000-000000001007', patient_e, 'new neck lump today', ARRAY['#symptom', '#timeline'], 'flagged', 'ai_extracted', '00000000-0000-0000-0000-000000001007', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO escalations (
    id, patient_id, clinic_id, conversation_id, original_question, patient_edited_question,
    ai_summary, context_snapshot, status, created_at, updated_at
  )
  VALUES
    (
      '00000000-0000-0000-0000-000000003001',
      patient_a,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000001',
      'Can the care team tell me if I need to stop Panadol?',
      'Please confirm whether I should stop Panadol before my biopsy on Thursday morning.',
      'Biopsy preparation question from oncology follow-up patient. Wants medication clarification before Thursday procedure.',
      '[{"id":"00000000-0000-0000-0000-000000002001","value":"takes Panadol occasionally","tags":["#medication"],"status":"stopped","authority":"ai_extracted"}]'::jsonb,
      'resolved',
      NOW() - INTERVAL '16 hours',
      NOW() - INTERVAL '15 hours'
    ),
    (
      '00000000-0000-0000-0000-000000003002',
      patient_b,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000002',
      'My headaches are worse in the morning. Is that something I should worry about?',
      'My headaches are worse in the morning and have been happening for several days. Can someone advise if I should come in?',
      'Morning headache concern with recurring symptoms. Needs triage on urgency and follow-up timing.',
      '[{"id":"00000000-0000-0000-0000-000000002002","value":"morning headaches","tags":["#symptom"],"status":"active","authority":"ai_extracted"}]'::jsonb,
      'resolved',
      NOW() - INTERVAL '13 hours',
      NOW() - INTERVAL '11 hours'
    ),
    (
      '00000000-0000-0000-0000-000000003003',
      patient_c,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000003',
      'I feel more breathless than usual after today''s infusion.',
      'I feel more breathless than usual after today''s infusion and walking upstairs is harder than normal.',
      'Post-infusion breathlessness with flagged symptom context. Needs prompt clinical review.',
      '[{"id":"00000000-0000-0000-0000-000000002003","value":"more breathless after infusion","tags":["#symptom"],"status":"flagged","authority":"ai_extracted"}]'::jsonb,
      'in_progress',
      NOW() - INTERVAL '4 hours',
      NOW() - INTERVAL '70 minutes'
    ),
    (
      '00000000-0000-0000-0000-000000003004',
      patient_d,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000004',
      'The nausea after my tablets is lasting most of the morning.',
      'My morning nausea after tablets is lasting until lunch. Could the care team advise if I should adjust timing?',
      'Medication timing question with persistent nausea. Lower urgency but still unresolved.',
      '[{"id":"00000000-0000-0000-0000-000000002004","value":"morning nausea after tablets","tags":["#symptom"],"status":"active","authority":"ai_extracted"}]'::jsonb,
      'pending',
      NOW() - INTERVAL '8 hours',
      NOW() - INTERVAL '8 hours'
    ),
    (
      '00000000-0000-0000-0000-000000003005',
      patient_e,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000005',
      'I found a hard lump on my neck today and now I''m scared.',
      'I found a hard lump on my neck today and would like the earliest available advice or appointment.',
      'New neck lump reported today with high anxiety and flagged context. Needs urgent triage.',
      '[{"id":"00000000-0000-0000-0000-000000002005","value":"new neck lump today","tags":["#symptom","#timeline"],"status":"flagged","authority":"ai_extracted"}]'::jsonb,
      'pending',
      NOW() - INTERVAL '90 minutes',
      NOW() - INTERVAL '90 minutes'
    ),
    (
      '00000000-0000-0000-0000-000000003006',
      patient_a,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000001',
      'Will the team explain what happens after the biopsy too?',
      'Can the team also explain what happens after the biopsy and who will call with results?',
      'Wants post-procedure expectations and communication timeline.',
      '[{"value":"biopsy booked for Thursday morning","tags":["#procedure"],"status":"active","authority":"ai_extracted"}]'::jsonb,
      'resolved',
      NOW() - INTERVAL '10 hours',
      NOW() - INTERVAL '8 hours'
    ),
    (
      '00000000-0000-0000-0000-000000003007',
      patient_b,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000002',
      'Can I still drive if the headache comes back tonight?',
      'If the headache comes back tonight, should I still drive tomorrow morning?',
      'Follow-up practical safety question about recurring headache symptoms.',
      '[{"value":"morning headaches","tags":["#symptom"],"status":"active","authority":"ai_extracted"}]'::jsonb,
      'resolved',
      NOW() - INTERVAL '7 hours',
      NOW() - INTERVAL '6 hours'
    ),
    (
      '00000000-0000-0000-0000-000000003008',
      patient_c,
      demo_clinic_id,
      '10000000-0000-0000-0000-000000000003',
      'Should I monitor my oxygen level tonight?',
      'Should I monitor my oxygen level tonight or come in sooner if the breathlessness gets worse?',
      'High-risk follow-up question linked to same post-infusion breathlessness thread.',
      '[{"value":"more breathless after infusion","tags":["#symptom"],"status":"flagged","authority":"ai_extracted"}]'::jsonb,
      'in_progress',
      NOW() - INTERVAL '3 hours',
      NOW() - INTERVAL '40 minutes'
    )
  ON CONFLICT (id) DO UPDATE
    SET patient_edited_question = EXCLUDED.patient_edited_question,
        ai_summary = EXCLUDED.ai_summary,
        context_snapshot = EXCLUDED.context_snapshot,
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO messages (id, user_id, conversation_id, content, sender, authority, language, message_type, metadata, created_at)
  VALUES
    (
      '00000000-0000-0000-0000-000000001101',
      patient_a,
      '10000000-0000-0000-0000-000000000001',
      'Please stop Panadol 24 hours before the biopsy unless our team tells you otherwise at your pre-procedure call. If you have new bleeding or feel faint tonight, come to SJMC Emergency or dial 999.',
      'clinician',
      'clinician_verified',
      'en',
      'provider_reply',
      '{"provider":{"name":"Dr Alan Teh","role":"Consultant Oncologist","providerName":"Asia OneHealthCare","hospitalName":"SJMC","specialty":"Oncology"},"disclaimer":"This message supports, but does not replace, urgent in-person care. If symptoms escalate, contact SJMC or dial 999.","quickActions":[{"id":"explain","label":"Explain this to me"},{"id":"next","label":"What should I do next?"},{"id":"urgent","label":"How urgent is this?"}],"appointmentOptions":[{"id":"slot-1","label":"Tue, 9 Apr · 10:00 AM","datetime":"2026-04-09T10:00:00+08:00"},{"id":"slot-2","label":"Wed, 10 Apr · 2:30 PM","datetime":"2026-04-10T14:30:00+08:00"}]}'::jsonb,
      NOW() - INTERVAL '15 hours'
    ),
    (
      '00000000-0000-0000-0000-000000001102',
      patient_b,
      '10000000-0000-0000-0000-000000000002',
      'Please arrange a clinic review this week if the headaches keep waking you or come with vomiting, weakness, or vision changes. If any of those happen suddenly, go to the nearest emergency department or call 999.',
      'clinician',
      'clinician_verified',
      'en',
      'provider_reply',
      '{"provider":{"name":"Dr Alan Teh","role":"Consultant Oncologist","providerName":"Asia OneHealthCare","hospitalName":"SJMC","specialty":"Oncology"},"disclaimer":"This message supports, but does not replace, urgent in-person care. If symptoms escalate, contact SJMC or dial 999.","quickActions":[{"id":"explain","label":"Explain this to me"},{"id":"next","label":"What should I do next?"},{"id":"urgent","label":"How urgent is this?"}],"appointmentOptions":[{"id":"slot-1","label":"Tue, 9 Apr · 10:00 AM","datetime":"2026-04-09T10:00:00+08:00"},{"id":"slot-2","label":"Wed, 10 Apr · 2:30 PM","datetime":"2026-04-10T14:30:00+08:00"}]}'::jsonb,
      NOW() - INTERVAL '11 hours'
    ),
    (
      '00000000-0000-0000-0000-000000001103',
      patient_a,
      '10000000-0000-0000-0000-000000000001',
      'After the biopsy, we expect mild soreness and we usually call with an update once pathology is reviewed. If pain or swelling rises quickly, contact the care team the same day.',
      'clinician',
      'clinician_verified',
      'en',
      'provider_reply',
      '{"provider":{"name":"Dr Alan Teh","role":"Consultant Oncologist","providerName":"Asia OneHealthCare","hospitalName":"SJMC","specialty":"Oncology"},"disclaimer":"This message supports, but does not replace, urgent in-person care. If symptoms escalate, contact SJMC or dial 999.","quickActions":[{"id":"explain","label":"Explain this to me"},{"id":"next","label":"What should I do next?"},{"id":"urgent","label":"How urgent is this?"}],"appointmentOptions":[{"id":"slot-1","label":"Tue, 9 Apr · 10:00 AM","datetime":"2026-04-09T10:00:00+08:00"},{"id":"slot-2","label":"Wed, 10 Apr · 2:30 PM","datetime":"2026-04-10T14:30:00+08:00"}]}'::jsonb,
      NOW() - INTERVAL '8 hours'
    ),
    (
      '00000000-0000-0000-0000-000000001104',
      patient_b,
      '10000000-0000-0000-0000-000000000002',
      'Please avoid driving tomorrow if the headache returns overnight or if you feel unsteady in the morning. Arrange transport and let us know if the pattern worsens.',
      'clinician',
      'clinician_verified',
      'en',
      'provider_reply',
      '{"provider":{"name":"Dr Alan Teh","role":"Consultant Oncologist","providerName":"Asia OneHealthCare","hospitalName":"SJMC","specialty":"Oncology"},"disclaimer":"This message supports, but does not replace, urgent in-person care. If symptoms escalate, contact SJMC or dial 999.","quickActions":[{"id":"explain","label":"Explain this to me"},{"id":"next","label":"What should I do next?"},{"id":"urgent","label":"How urgent is this?"}],"appointmentOptions":[{"id":"slot-1","label":"Tue, 9 Apr · 10:00 AM","datetime":"2026-04-09T10:00:00+08:00"},{"id":"slot-2","label":"Wed, 10 Apr · 2:30 PM","datetime":"2026-04-10T14:30:00+08:00"}]}'::jsonb,
      NOW() - INTERVAL '6 hours'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO clinician_replies (id, escalation_id, clinician_id, message_id, ai_draft, final_reply, diff_log, sent_at)
  VALUES
    (
      '00000000-0000-0000-0000-000000004001',
      '00000000-0000-0000-0000-000000003001',
      clinician_id,
      '00000000-0000-0000-0000-000000001101',
      'Please stop Panadol before the biopsy and call if you feel worse.',
      'Please stop Panadol 24 hours before the biopsy unless our team tells you otherwise at your pre-procedure call. If you have new bleeding or feel faint tonight, come to SJMC Emergency or dial 999.',
      '[{"type":"removed","value":"Please stop Panadol before the biopsy and call if you feel worse."},{"type":"added","value":"Please stop Panadol 24 hours before the biopsy unless our team tells you otherwise at your pre-procedure call. If you have new bleeding or feel faint tonight, come to SJMC Emergency or dial 999."}]'::jsonb,
      NOW() - INTERVAL '15 hours'
    ),
    (
      '00000000-0000-0000-0000-000000004002',
      '00000000-0000-0000-0000-000000003002',
      clinician_id,
      '00000000-0000-0000-0000-000000001102',
      'Please arrange a review this week if headaches continue.',
      'Please arrange a clinic review this week if the headaches keep waking you or come with vomiting, weakness, or vision changes. If any of those happen suddenly, go to the nearest emergency department or call 999.',
      '[{"type":"removed","value":"Please arrange a review this week if headaches continue."},{"type":"added","value":"Please arrange a clinic review this week if the headaches keep waking you or come with vomiting, weakness, or vision changes. If any of those happen suddenly, go to the nearest emergency department or call 999."}]'::jsonb,
      NOW() - INTERVAL '11 hours'
    ),
    (
      '00000000-0000-0000-0000-000000004003',
      '00000000-0000-0000-0000-000000003006',
      clinician_id,
      '00000000-0000-0000-0000-000000001103',
      'We will call after pathology is back.',
      'After the biopsy, we expect mild soreness and we usually call with an update once pathology is reviewed. If pain or swelling rises quickly, contact the care team the same day.',
      '[{"type":"removed","value":"We will call after pathology is back."},{"type":"added","value":"After the biopsy, we expect mild soreness and we usually call with an update once pathology is reviewed. If pain or swelling rises quickly, contact the care team the same day."}]'::jsonb,
      NOW() - INTERVAL '8 hours'
    ),
    (
      '00000000-0000-0000-0000-000000004004',
      '00000000-0000-0000-0000-000000003007',
      clinician_id,
      '00000000-0000-0000-0000-000000001104',
      'Avoid driving if symptoms return.',
      'Please avoid driving tomorrow if the headache returns overnight or if you feel unsteady in the morning. Arrange transport and let us know if the pattern worsens.',
      '[{"type":"removed","value":"Avoid driving if symptoms return."},{"type":"added","value":"Please avoid driving tomorrow if the headache returns overnight or if you feel unsteady in the morning. Arrange transport and let us know if the pattern worsens."}]'::jsonb,
      NOW() - INTERVAL '6 hours'
    )
  ON CONFLICT (id) DO NOTHING;
END $$;
