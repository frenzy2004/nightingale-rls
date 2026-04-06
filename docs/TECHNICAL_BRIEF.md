# Nightingale Patient Messenger - Technical Brief

## Architecture

```text
PATIENT WEB APP                 AI + MEMORY LAYER                   CLINIC WEB APP
----------------                -----------------                   ---------------

Branded messenger UI  --->      PHI redaction                  ---> Branded triage queue
High-risk banner                Risk classifier                      Status chips + urgency
Review-before-send              Gemini 2.5 Flash                     Patient detail / EMR mock
Care-team status tracker        Deterministic demo fallbacks         Reply editor
Provider reply cards            Tag extraction + contradictions      Consult summary composer
Quick actions + appointment     Supabase persistence + logging       Verified send pipeline

                                      |
                                      v
                                SUPABASE
                     Auth + Postgres + RLS + Realtime
```

## Request Flow

1. Patient sends a message in the PWA.
2. The server runs PHI redaction and deterministic risk assessment.
3. Gemini generates a short-turn response, or `DEMO_MODE` falls back to a deterministic one.
4. Extracted tags are written to `memory_tags`, and contradictions are handled in the real chat write path.
5. After enough turns or higher-risk content, the patient sees `Send to Clinic`.
6. The patient reviews and edits the exact outbound question before anything is sent.
7. The clinic queue receives the escalated item with AI summary + tagged context snapshot.
8. The provider edits the AI draft and sends a verified response.
9. The verified response is injected back into the same patient thread through Realtime, with provider metadata, disclaimer, quick actions, and mocked appointment slots.
10. A clinician can also send a consult summary from the patient record page as a distinct verified message.

## Schema

```text
clinics (1) ------< users (many)
                      |
                      +------< patient_profiles (1:1 with patient user)
                      |
                      +------< messages
                               - message_type
                               - metadata JSONB
                               |
                               +------< memory_tags
                                        - status
                                        - authority
                                        - source_message_id

users (patient) ----< escalations
                      - patient_edited_question
                      - ai_summary
                      - context_snapshot
                      - status
                      - updated_at
                      |
                      +------< clinician_replies
                               - ai_draft
                               - final_reply
                               - diff_log

experiment_logs
```

## Key Design Decisions

### Tagged memory over transcript retrieval

The app stores structured patient facts instead of repeatedly scanning the whole chat transcript. This keeps escalation packaging cheap and predictable even as conversations grow.

### Contradictions are preserved

If a patient says `I take Panadol` and later says `I stopped last week`, both states are preserved. The chat API now runs contradiction handling directly in the live write path, and clinician-verified replies can flag older AI-derived tags.

### Deterministic demo mode

The demo brief explicitly called out failure states that should never appear in front of a hospital audience. `DEMO_MODE` therefore provides deterministic fallbacks for:

- patient chat
- triage summaries
- clinician drafts

This keeps the real architecture in place while preventing brittle UI during a demo.

### Provider messages are first-class data

Verified provider messages are not just plain text. They are stored with:

- `message_type`
- provider identity metadata
- disclaimer copy
- quick actions
- appointment slot data

That metadata powers the patient-side provider card without parsing message text.

## What Changed for Demo Readiness

- Added Asia OneHealthCare / SJMC branding across landing, auth, patient, and clinic surfaces.
- Localized emergency messaging to Malaysia (`999`) and SJMC.
- Added always-visible patient safety footer.
- Added deterministic high-risk banner and escalation recommendation path.
- Added patient care-team status tracker:
  - `Sent to care team`
  - `Care team reviewing`
  - `Response received`
- Added seeded demo queue with mixed urgency and realistic timestamps.
- Added patient detail / EMR-style page with allergies, history stats, recent queue Q&A, and consult-summary send-back.

## Security and Access Control

Server-side protections remain enforced through Supabase RLS plus API auth checks:

- patients cannot access clinic queue pages or clinic APIs
- patients can only access their own data
- clinicians/admins are limited to patients in their own clinic
- APIs verify the authenticated user before using the service client for cross-table reads

The project keeps the `SECURITY DEFINER` helper function pattern to avoid recursive RLS policies on `users`.

## Experiment Logging

The prototype continues logging trust-loop research events, including:

- `message_sent`
- `escalation_triggered`
- `patient_edit_before_send`
- `clinician_edit_before_send`
- `ai_clinician_diff`
- `verified_answer_injected`
- `response_turnaround_time`
- `tag_extracted`
- `contradiction_detected`

## Test / Verification Status

- The application builds successfully with `npm run build`.
- The existing Vitest suite cannot be executed from this Codex sandbox because Vitest startup hits a Windows `spawn EPERM` before tests run.
