-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clinics table
CREATE TABLE clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (extends auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('patient', 'clinician', 'admin')) DEFAULT 'patient',
  clinic_id UUID REFERENCES clinics(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  content TEXT NOT NULL,
  sender TEXT NOT NULL CHECK (sender IN ('patient', 'ai', 'clinician')),
  authority TEXT NOT NULL CHECK (authority IN ('ai_generated', 'clinician_verified')) DEFAULT 'ai_generated',
  language TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Memory tags table
CREATE TABLE memory_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('active', 'stopped', 'resolved', 'flagged')) DEFAULT 'active',
  authority TEXT NOT NULL CHECK (authority IN ('ai_extracted', 'clinician_verified')) DEFAULT 'ai_extracted',
  source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Escalations table
CREATE TABLE escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  original_question TEXT NOT NULL,
  patient_edited_question TEXT NOT NULL,
  ai_summary TEXT NOT NULL,
  context_snapshot JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'resolved')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clinician replies table
CREATE TABLE clinician_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  escalation_id UUID NOT NULL REFERENCES escalations(id) ON DELETE CASCADE,
  clinician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  ai_draft TEXT NOT NULL,
  final_reply TEXT NOT NULL,
  diff_log JSONB NOT NULL DEFAULT '[]',
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Experiment logs table
CREATE TABLE experiment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_memory_tags_user_id ON memory_tags(user_id);
CREATE INDEX idx_memory_tags_status ON memory_tags(status);
CREATE INDEX idx_escalations_clinic_id ON escalations(clinic_id);
CREATE INDEX idx_escalations_status ON escalations(status);
CREATE INDEX idx_experiment_logs_event_type ON experiment_logs(event_type);
CREATE INDEX idx_experiment_logs_user_id ON experiment_logs(user_id);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinician_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Clinicians can view patients in their clinic" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = users.clinic_id
    )
  );

-- Clinics policies
CREATE POLICY "Users can view their clinic" ON clinics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.clinic_id = clinics.id
    )
  );

-- Messages policies
CREATE POLICY "Users can view own messages" ON messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own messages" ON messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Clinicians can view messages from patients in their clinic" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN users patient ON patient.id = messages.user_id
      WHERE u.id = auth.uid()
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = patient.clinic_id
    )
  );

CREATE POLICY "Clinicians can insert messages for patients in their clinic" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN users patient ON patient.id = messages.user_id
      WHERE u.id = auth.uid()
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = patient.clinic_id
    )
  );

-- Memory tags policies
CREATE POLICY "Users can view own memory tags" ON memory_tags
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own memory tags" ON memory_tags
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own memory tags" ON memory_tags
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Clinicians can view memory tags for patients in their clinic" ON memory_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN users patient ON patient.id = memory_tags.user_id
      WHERE u.id = auth.uid()
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = patient.clinic_id
    )
  );

-- Escalations policies
CREATE POLICY "Patients can view own escalations" ON escalations
  FOR SELECT USING (patient_id = auth.uid());

CREATE POLICY "Patients can insert own escalations" ON escalations
  FOR INSERT WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Clinicians can view escalations for their clinic" ON escalations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = escalations.clinic_id
    )
  );

CREATE POLICY "Clinicians can update escalations for their clinic" ON escalations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = escalations.clinic_id
    )
  );

-- Clinician replies policies
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
    EXISTS (
      SELECT 1 FROM escalations e
      JOIN users u ON u.id = auth.uid()
      WHERE e.id = clinician_replies.escalation_id
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = e.clinic_id
    )
  );

CREATE POLICY "Clinicians can insert replies for their clinic" ON clinician_replies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM escalations e
      JOIN users u ON u.id = auth.uid()
      WHERE e.id = clinician_replies.escalation_id
      AND u.role IN ('clinician', 'admin')
      AND u.clinic_id = e.clinic_id
    )
    AND clinician_id = auth.uid()
  );

-- Experiment logs policies (service role only for writes, users can read own)
CREATE POLICY "Users can view own experiment logs" ON experiment_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can insert experiment logs" ON experiment_logs
  FOR INSERT WITH CHECK (true);

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'patient')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create user profile
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update memory tag timestamps
CREATE OR REPLACE FUNCTION update_memory_tag_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER memory_tag_updated
  BEFORE UPDATE ON memory_tags
  FOR EACH ROW EXECUTE FUNCTION update_memory_tag_timestamp();

-- Enable realtime for messages (for live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE escalations;
ALTER PUBLICATION supabase_realtime ADD TABLE clinician_replies;
