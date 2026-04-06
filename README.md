# Nightingale Patient Messenger

Nightingale is a hospital-branded patient messaging demo built for the Asia OneHealthCare / SJMC workflow:

patient chat -> tagged memory -> patient review before send -> clinic queue -> provider reply -> verified answer back in-thread

The current build keeps the original trust loop and adds deterministic demo-readiness features:

- branded patient and clinic surfaces
- Malaysia-localized emergency copy (`999`, SJMC)
- short-turn AI replies with code-level response limiting
- provider reply cards with quick actions and mocked appointment CTA
- seeded active queue with mixed urgency/status
- clinic patient record page with consult-summary send-back flow
- `DEMO_MODE` fallbacks so demo-critical UI never shows raw AI failure strings

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Patient | `demo.patient@nightingale.health` | `NightingaleDemo2025!` |
| Clinician | `demo.doctor@nightingale.health` | `NightingaleDemo2025!` |

Additional fake patients are seeded for the clinic queue and patient-record demo surfaces.

## Tech Stack

- Next.js 16.2.2 App Router
- React 19
- TypeScript 5
- Tailwind CSS 4 + shadcn/ui
- Supabase Auth / Postgres / Realtime / RLS
- Google Gemini 2.5 Flash
- Vitest + Testing Library

## Environment

Copy `.env.local.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
NEXT_PUBLIC_DEMO_MODE=true
```

`NEXT_PUBLIC_DEMO_MODE=true` enables the demo-safe behavior:

- deterministic triage summary fallback
- deterministic clinician draft fallback
- deterministic chat fallback
- provider appointment CTA on verified replies

## Setup

1. Install dependencies:

```bash
npm install
```

2. Run Supabase migrations in order from `supabase/migrations/`.

Important demo migrations:

- `006_demo_readiness_schema.sql`
- `007_demo_readiness_seed.sql`

These add:

- richer `clinics` branding fields
- `patient_profiles`
- `messages.message_type`
- `messages.metadata`
- `escalations.updated_at`
- seeded Asia OneHealthCare / SJMC demo data

3. Ensure Realtime is enabled for:

- `messages`
- `escalations`
- `clinician_replies`

4. Start the app:

```bash
npm run dev
```

## Core Flow

### Patient Web App

- The patient chats with Nightingale in a WhatsApp-style thread.
- AI replies are hard-limited to short turns and localized for the demo.
- Deterministic risk assessment drives the inline urgent banner.
- After enough turns or a higher-risk message, the patient sees `Send to Clinic`.
- The review-before-send modal always shows the exact outbound question and tagged context.
- After send, the patient sees a status tracker:
  - `Sent to care team`
  - `Care team reviewing`
  - `Response received`

### Clinic Web App

- The clinic queue is branded for Asia OneHealthCare / SJMC.
- Seeded demo data keeps the queue active with mixed urgency and statuses.
- Queue states are displayed as:
  - `Received`
  - `Reviewing`
  - `Responded`
- Providers can open a reply editor, edit the AI draft, and send a verified response.
- Patient names open an EMR-style patient page with allergies, history stats, recent Q&A, and consult summary send-back.

### Verified Provider Messages

Verified provider replies are stored as `message_type = provider_reply` and include metadata for:

- provider identity
- disclaimer copy
- quick actions
- mocked appointment slots

Consult summaries are injected with `message_type = consult_summary`.

## Memory and Context

The memory layer stores extracted facts in `memory_tags` instead of relying on full transcript retrieval.

Tracked categories include:

- medications
- symptoms
- procedures
- diagnoses / conditions
- allergies
- lifestyle
- timelines

Each tag keeps:

- `value`
- `tags`
- `status`
- `authority`
- `source_message_id`
- timestamps

Contradictions are preserved instead of silently overwritten. The live chat path now performs contradiction detection when new tags are written, and clinician-verified messages can flag older AI-derived context.

## Security

RBAC is enforced with Supabase RLS plus server-side API checks:

- patients cannot access clinic routes or clinic APIs
- patients can only access their own messages, escalations, and patient profile
- clinicians/admins are scoped to their own clinic
- APIs still verify the authenticated user before using the service client for privileged queries

The repo uses helper SQL functions such as `get_my_role()`, `get_my_clinic_id()`, and `get_my_profile()` to avoid recursive RLS issues.

## Key Tables

- `messages`
- `memory_tags`
- `escalations`
- `clinician_replies`
- `patient_profiles`
- `experiment_logs`
- `clinics`
- `users`

## Scripts

```bash
npm run dev
npm run build
npm run test:run
```

## Verification Notes

- `npm run build` passes.
- `npm run test:run` is currently blocked in this Codex sandbox by a Windows `spawn EPERM` during Vitest startup, even though the app build succeeds.

## Demo Scenarios

1. Context build-up:
   patient asks a question over 2-3 turns, tags accumulate, and the high-risk banner/status logic can appear.

2. Review before send:
   patient edits the outbound clinic question and sends it to the care team.

3. Verified response loop:
   clinician replies from the queue, the provider card appears back in-thread, and the patient can tap quick actions or appointment CTA.

4. EMR detail flow:
   clinician opens the patient record page, reviews recent queue history, records a consult, and sends a consult summary back to the patient messenger.
