# Nightingale Patient Messenger

A healthcare messenger application that enables patients to ask health questions via AI chat, accumulates medical context over time, escalates questions to clinics, and injects verified clinician responses back into the conversation.

## Features

- **Patient Chat Interface**: WhatsApp-simple 1-on-1 chat with Nightingale AI
- **Multi-language Support**: Automatic language detection and response matching
- **Memory Layer**: Persistent health context with automatic tagging
- **Contradiction Handling**: Preserves conflicting information with status markers
- **Clinic Escalation**: Patient-controlled escalation with edit-before-send
- **Clinician Triage**: Support ticket view for healthcare providers
- **Verified Responses**: Clinician replies marked as ground truth
- **Experiment Logging**: Comprehensive event tracking for research

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (Auth, Database, Realtime, RLS)
- **AI**: Google Gemini API
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd nightingale
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

4. Set up Supabase:
   - Create a new Supabase project
   - Run the migration in `supabase/migrations/001_initial_schema.sql`
   - Enable Realtime for the `messages`, `escalations`, and `clinician_replies` tables

5. Start the development server:
```bash
npm run dev
```

## How Memory Works

The memory system automatically extracts and tags medical information from patient messages:

### Tag Categories
- `#medication` - Drugs, supplements, dosages
- `#symptom` - Reported symptoms
- `#condition` - Diagnosed conditions
- `#procedure` - Medical procedures
- `#allergy` - Known allergies
- `#lifestyle` - Diet, exercise, habits
- `#timeline` - Dates and durations

### Status Markers
- `active` - Current state
- `stopped` - Discontinued
- `resolved` - No longer an issue
- `flagged` - Needs clarification (contradiction detected)

### Authority Levels
- `ai_extracted` - Automatically extracted by AI
- `clinician_verified` - Confirmed by healthcare provider

### Contradiction Resolution

When the system detects conflicting information (e.g., "I take Panadol" followed by "I stopped last week"):

1. Both states are preserved with their `source_message_id` pointers
2. The `status` field tracks the current state
3. If the existing tag is `clinician_verified`, both are flagged for review
4. Otherwise, the status is updated to reflect the most recent information

## How Escalation Works

### Trigger
After 3+ turns or when the AI indicates uncertainty, patients see: "Send this to your clinic?"

### Patient Control
1. Patient clicks "Send to Clinic"
2. Edit Before Send modal opens with:
   - Editable question text
   - AI-generated summary
   - Relevant tagged context
3. Patient reviews, edits, and confirms

### Clinic Triage
1. Clinicians see pending escalations in triage queue
2. Each item shows: patient question, AI summary, context snapshot
3. AI generates a draft response for the clinician to edit

### Verified Response
1. Clinician edits and sends the response
2. Response appears in patient chat as a distinct "Clinician" bubble
3. Marked with `authority: clinician_verified`
4. Both AI draft and final reply are stored for research

## How RBAC is Enforced

### Role Types
- `patient` - Can only access own data
- `clinician` - Can access patients in their clinic
- `admin` - Same as clinician

### Row Level Security (RLS)

All access control is enforced at the database level:

**Messages**
- Patients: Can view/insert own messages only
- Clinicians: Can view/insert messages for patients in their clinic

**Memory Tags**
- Patients: Can view/update own tags only
- Clinicians: Can view tags for patients in their clinic

**Escalations**
- Patients: Can view/create own escalations only
- Clinicians: Can view/update escalations for their clinic

**Clinician Replies**
- Patients: Can view replies to their escalations
- Clinicians: Can view/create replies for their clinic

### Route Protection

Middleware enforces:
- Unauthenticated users redirected to login
- Patients redirected away from `/clinic/*` routes
- Clinicians redirected to triage after login

## Running Tests

```bash
# Run tests
npm test

# Run tests once
npm run test:run
```

### Test Coverage

- `test_escalation_trigger` - Verifies escalation prompt, patient edit, context packaging
- `test_memory_contradiction` - Verifies both states preserved, status markers, source pointers
- `test_clinic_reply_injection` - Verifies verified bubble, authority marking, conflict flagging
- `test_access_control` - Verifies RBAC policies
- `test_edit_delta_log` - Verifies AI draft and clinician edit storage

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login/register pages
│   ├── (patient)/        # Patient chat
│   ├── (clinic)/         # Clinician portal
│   └── api/              # API routes
├── components/
│   ├── chat/             # Chat UI components
│   ├── clinic/           # Clinic UI components
│   └── ui/               # shadcn components
├── hooks/                # React hooks
├── lib/
│   ├── ai/               # Gemini, guardrails, PHI redaction
│   └── supabase/         # Supabase clients
└── types/                # TypeScript types
```

## Experiment Logging

All events are logged to `experiment_logs` table:

| Event Type | Description |
|------------|-------------|
| `message_sent` | Patient, AI, or clinician message |
| `escalation_triggered` | Escalation created |
| `escalation_prompt_shown` | Prompt displayed to patient |
| `patient_edit_before_send` | Patient edited question |
| `clinician_edit_before_send` | Clinician edited response |
| `ai_clinician_diff` | Diff between AI draft and final |
| `verified_answer_injected` | Clinician reply added to chat |
| `response_turnaround_time` | Time from escalation to response |
| `contradiction_detected` | Conflicting information found |
| `tag_extracted` | Memory tag created |

## License

MIT
