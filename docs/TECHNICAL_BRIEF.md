# Nightingale Patient Messenger — Technical Brief

## Architecture Diagram

```
  PATIENT                    AI + MEMORY LAYER                 CLINIC PORTAL
  ──────                    ─────────────────                 ────────────────
  
  ┌──────────────┐          ┌──────────────────┐          ┌──────────────────┐
  │ Messenger UI │──────▶│  PHI Redaction     │          │  Triage Queue    │
  │ (WhatsApp-   │        │  ↓                 │          │  (urgency-scored)│
  │  style chat) │        │  Gemini 2.5 Flash  │          │                  │
  └──────┬───────┘        │  ↓                 │          │  AI summary +    │
         │                │  Tag Extraction    │          │  context snapshot│
         │                │  ↓                 │          └────────┬─────────┘
  ┌──────▼───────┐        │  Contradiction     │                   │
  │ Edit + Send  │        │  Detection         │          ┌────────▼─────────┐
  │ (patient     │        └────────┬───────────┘          │  AI Draft + Edit │
  │  reviews &   │                 │                      │  (clinician edits│
  │  edits)      │                 │                      │   signs off,     │
  └──────┬───────┘                 │                      │   sends)         │
         │                         │                      └────────┬─────────┘
         │                ┌────────▼───────────┐                   │
  ┌──────▼───────┐        │  Memory Store      │          ┌────────▼─────────┐
  │ Verified     │◀───────│  (tagged, versioned│◀─────────│  Edit Delta Log  │
  │ Bubble       │        │   contradiction-   │          │  (AI draft vs    │
  │ (clinician   │        │   aware)           │          │   final diff)    │
  │  answer)     │        └────────────────────┘          └──────────────────┘
  └──────────────┘                 │
                                   │
                          ┌────────▼───────────┐
                          │    SUPABASE        │
                          │  ┌──────────────┐  │
                          │  │ PostgreSQL   │  │
                          │  │ Auth + RLS   │  │
                          │  │ Realtime     │  │
                          │  └──────────────┘  │
                          └────────────────────┘
```

**Request flow**: Patient message → PHI redaction → Gemini generates response → tags extracted → both messages + tags persisted → after N turns, escalation offered → patient edits & sends → clinician sees in triage → edits AI draft → verified reply injected back into patient thread via Realtime.

## Schema: Messages ↔ Memory/Tags ↔ Escalations ↔ Clinician Replies

```
clinics (1) ──────< users (many)
                      │
                      │ user_id
                      ▼
                   messages ──────────────────┐
                      │                        │ source_message_id
                      │ conversation_id        ▼
                      │                    memory_tags
                      │                    (value, tags[], status,
                      │                     authority, source_message_id,
                      │                     updated_at)
                      │
                      │ patient_id
                      ▼
                   escalations ───────< clinician_replies
                   (patient_edited_     (ai_draft, final_reply,
                    question,            diff_log, clinician_id,
                    ai_summary,          message_id → messages)
                    context_snapshot,
                    status)
                                        
                   experiment_logs (append-only event stream)
```

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `messages` | All chat turns (patient, AI, clinician) | `user_id → users`, `conversation_id` groups a thread |
| `memory_tags` | Extracted medical facts | `source_message_id → messages`, `user_id → users` |
| `escalations` | Questions sent to clinic | `patient_id → users`, `clinic_id → clinics`, carries `context_snapshot` (JSONB) |
| `clinician_replies` | Clinician responses + edit tracking | `escalation_id → escalations`, `message_id → messages` (the injected verified bubble) |
| `experiment_logs` | Research event stream | `event_type` + `payload` (JSONB), append-only |

## Assumptions and First-Principles Thinking

### Why tagged memory instead of transcript retrieval?

The spec identifies the problem: flat transcript retrieval has unbounded token cost and latency. Our solution:

- Extract **structured tags** from each message in real-time (medications, symptoms, procedures, diagnoses, timelines)
- Store with **metadata** (status, authority, source pointer, timestamps)
- Package **only relevant tags** with escalations via keyword matching

Result: O(1) context retrieval. A 100-message conversation produces the same-sized context payload as a 5-message one.

### Why both states on contradiction?

Medical facts change — patients start and stop medications. The system must reflect reality, not enforce consistency.

When "I take Panadol" is followed by "I stopped last week":
1. Original tag preserved unchanged (audit trail)
2. New tag inserted with `status: stopped` and distinct `source_message_id`
3. Both records exist with their own timestamps
4. When a clinician replies, their verified facts get `authority: clinician_verified` and conflicting AI tags are set to `status: flagged`

The clinician's reply is what resolves the contradiction — it carries the highest authority.

### Why patient-in-the-loop is mandatory?

Healthcare communication requires informed consent. The patient must see exactly what context is being shared with their clinic before it leaves their device. The Edit Before Send modal is not a nice-to-have — it's the mechanism that makes the escalation trustworthy.

### Why urgency scoring?

Clinicians shouldn't manually sort a triage queue. We score dynamically:
- Flagged (contradicted) tags: **+3 points** each — contradictions need attention
- Active tags: **+1 point** each — more context = more complex case
- Hours pending: **+1 point/hour** (max 10) — older unresolved questions float up

## What We Cut and Why

| Cut | Reason | Impact |
|-----|--------|--------|
| **NeMo Guardrails** | Spec listed as a question, not a requirement. Built custom guardrails layer instead (input safety, response validation, emergency detection). NeMo adds deployment complexity with marginal benefit for a prototype. | Low — custom guardrails cover the critical cases |
| **Voice AI** | Explicitly out of scope per spec | None |
| **EMR integration** | Explicitly out of scope per spec | None |
| **Billing** | Explicitly out of scope per spec | None |
| **Multi-model routing** | Using Gemini 2.5 Flash for all tasks (chat, tags, summaries, drafts). Production would route by cost/quality. | Acceptable — Flash is fast and cheap enough for all tasks |
| **RAG knowledge base** | The `diff_log` data is being collected (AI draft vs clinician edit), but we don't yet use it to improve future drafts. The infrastructure is in place — accumulation happens, retrieval doesn't. | Foundation built, retrieval is a future iteration |

## Security and Access Control

**Server-side enforced via Supabase RLS + API auth checks:**

- Patient cannot access `/clinic/*` routes (client redirect + API auth)
- Patient A cannot see Patient B's messages (RLS: `user_id = auth.uid()`)
- Clinician can only see patients in their own clinic (RLS via `SECURITY DEFINER` helper functions)
- API routes authenticate via `auth.getUser()`, then use service role for DB operations
- PHI redaction strips SSNs, phone numbers, emails, DOBs before sending to Gemini

**SECURITY DEFINER pattern**: RLS policies on the `users` table caused infinite recursion (a policy checking the user's role queries the same table). We created `get_my_role()`, `get_my_clinic_id()`, and `get_my_profile()` as PostgreSQL functions with `SECURITY DEFINER` that bypass RLS for self-referential lookups.

## Experiment Logging

Built in from day one. Every significant event is logged to `experiment_logs`:

| Event | What's Captured |
|-------|-----------------|
| `message_sent` | Every patient, AI, and clinician message (with sender, conversation_id) |
| `escalation_triggered` | Turn count at escalation, conversation_id |
| `patient_edit_before_send` | Original question vs. patient-edited version |
| `clinician_edit_before_send` | AI draft vs. clinician final reply |
| `ai_clinician_diff` | Structured diff between AI draft and final (for KB building) |
| `verified_answer_injected` | Clinician reply inserted into patient thread + response turnaround time |
| `tag_extracted` | Each new memory tag with confidence score |
| `contradiction_detected` | When conflicting tags are identified |

This supports the paper: measuring trust loop effectiveness, AI draft quality (via edit distance), escalation patterns, and clinician response times.
