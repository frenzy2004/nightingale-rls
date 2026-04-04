# Nightingale Technical Brief

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Patient App                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Chat UI    │  │ Memory Tags │  │ Escalation  │  │ Edit Before │    │
│  │             │  │   Panel     │  │   Prompt    │  │    Send     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js API Routes                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  /api/chat  │  │  /api/tags  │  │/api/escalate│  │ /api/reply  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            AI Layer                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Gemini API │  │  Guardrails │  │PHI Redaction│  │Tag Extractor│    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Supabase Backend                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Messages  │  │ Memory Tags │  │ Escalations │  │   Clinician │    │
│  │             │  │             │  │             │  │   Replies   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Row Level Security (RLS)                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Realtime Subscriptions                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Schema Design

### Data Flow

```
Patient Message
      │
      ▼
┌─────────────┐     ┌─────────────┐
│  messages   │────▶│ memory_tags │
└─────────────┘     └─────────────┘
      │                    │
      │                    ▼
      │             ┌─────────────┐
      │             │ (conflicts) │
      │             └─────────────┘
      │
      ▼
┌─────────────┐     ┌─────────────┐
│ escalations │────▶│  clinician  │
└─────────────┘     │   replies   │
                    └─────────────┘
                          │
                          ▼
                    ┌─────────────┐
                    │  messages   │
                    │ (verified)  │
                    └─────────────┘
```

### Key Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User profiles | `role`, `clinic_id` |
| `messages` | Chat messages | `sender`, `authority` |
| `memory_tags` | Health context | `status`, `authority`, `source_message_id` |
| `escalations` | Patient questions | `patient_edited_question`, `context_snapshot` |
| `clinician_replies` | Provider responses | `ai_draft`, `final_reply`, `diff_log` |
| `experiment_logs` | Research events | `event_type`, `payload` |

## Assumptions and First-Principles Thinking

### Core Assumption: Trust Through Control

The system is built on the premise that healthcare AI should enhance, not replace, the patient-provider relationship. Every design decision prioritizes:

1. **Patient Control**: Patients review and edit before anything leaves their device
2. **Clinician Authority**: Verified responses override AI-generated content
3. **Transparency**: Both AI drafts and human edits are preserved

### Memory Design Philosophy

**Why not flat transcripts?**
- Token costs grow unboundedly
- Retrieval latency increases with history
- Context windows have limits

**Why structured tags?**
- O(1) lookup for specific facts
- Semantic categorization enables smart filtering
- Status tracking enables contradiction detection
- Authority levels establish ground truth hierarchy

### Contradiction Handling

**First Principle**: Medical facts change. Patients start and stop medications. Symptoms appear and resolve. The system must reflect reality, not enforce consistency.

**Implementation**:
- Both states are preserved (audit trail)
- `source_message_id` enables traceability
- `updated_at` provides recency
- `authority` establishes truth hierarchy (clinician > AI)
- `flagged` status surfaces conflicts for human review

### Escalation Design

**First Principle**: Patients know when they need human certainty.

**Implementation**:
- System suggests escalation, patient decides
- Edit before send ensures patient control
- Context packaging reduces clinician cognitive load
- AI draft reduces response time while preserving human judgment

## What We Cut and Why

### Voice AI
- **Why cut**: Complexity of speech-to-text, speaker diarization, accessibility concerns
- **Trade-off**: Text-only limits accessibility for some users
- **Future**: Could add via Whisper API with transcription review

### Full EMR Integration
- **Why cut**: FHIR/HL7 complexity, compliance requirements, clinic IT dependencies
- **Trade-off**: Clinicians must manually reference patient records
- **Future**: SMART on FHIR apps enable standardized EMR access

### Billing/Payment
- **Why cut**: PCI compliance, payment gateway integration, refund handling
- **Trade-off**: Monetization path unclear
- **Future**: Stripe integration for subscription or per-escalation billing

### NeMo Guardrails (NVIDIA)
- **Why cut**: Deployment complexity, latency overhead, unclear ROI vs. prompt engineering
- **Trade-off**: Relying on custom guardrails + Gemini's built-in safety
- **Future**: Evaluate after measuring jailbreak attempts in production

### Provider-Specific Knowledge Base
- **Why cut**: Requires significant data accumulation, RAG infrastructure
- **Trade-off**: Each clinician starts fresh
- **Future**: Use diff_log to train clinic-specific models

## Security Considerations

### PHI Handling
- Redaction pipeline strips SSN, DOB, addresses, phone numbers
- Sanitized payloads in experiment logs
- No PHI in error logs or console output

### Access Control
- RLS enforces all policies at database level
- Middleware provides defense-in-depth for routes
- No client-side only access checks

### Data Isolation
- Patient A cannot access Patient B (RLS)
- Clinic A cannot access Clinic B (RLS)
- Service role only for logging (restricted API routes)

## Performance Considerations

### Realtime Subscriptions
- Channel per conversation (not global)
- Unsubscribe on component unmount
- Debounce rapid updates

### AI Latency
- Gemini Flash for speed
- Tag extraction runs async after response
- Triage summary generated on-demand

### Database
- Indexes on `user_id`, `conversation_id`, `clinic_id`
- Pagination for large result sets (not implemented, TODO)
- Connection pooling via Supabase

## Monitoring Recommendations

1. **Latency**: Track P50/P95 for Gemini API calls
2. **Escalation Rate**: Monitor % of conversations that escalate
3. **Clinician Response Time**: Track turnaround from escalation to reply
4. **Edit Rate**: % of AI drafts modified by clinicians (training signal)
5. **Contradiction Rate**: Frequency of flagged tags (memory quality signal)
6. **Safety Events**: Log and review blocked inputs/outputs
