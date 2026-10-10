# The Coding Shift: Qualtrics survey

Built by `build_coding_shift_qsf.py` into `the_coding_shift.qsf`. Live as "The Coding Shift v3"
(SV_5cYdgJJIsz2WJBc, imported 2026-10-09); the earlier SV_9mKt30e7sUqfO50 has the two-batch flow. Import as a **new** project
(Projects > Create a new project > Survey > Import a QSF file). The old consumer-panel surveys are
not touched.

The participant is hired for one shift as a Feedback Coder. Qualtrics hosts every page and stores
every variable; the only outside calls are `/api/health` (consent page, wakes the service) and
`/api/rejection/start` + `/api/rejection/result` (interim and waiting pages).

## Flow

1. **Embedded data** (first element): Prolific ids, `condition`, and every field the scripts write
   (see the dictionary below).
2. **Consent** (`js_consent.js`). Branch: not willing → end, no code.
3. **Randomiser**: `condition` = HP_HC / HP_LC / LP_HC / LP_LC, evenly. Assigned before the note,
   used only if a note is attached and classed as voice.
4. **Training**: one page with the five categories, then two practice comments. The rule box
   ("choose one; if several things, the one it is mainly about; no other") appears only on the
   practice pages, and each practice answer page explains the rule. The comment pages carry no
   rule box, and the rationale page is gone.
5. **Batch 1**: eight ordinary end-of-study comments, one per page, five categories each, forced.
   Comments 3, 5, 6 and 8 raise two problems.
6. **Note 1**: one page for everyone, straight after batch 1 (the separate attach/finish page was
   dropped on 2026-10-08). The essay box is not forced; an empty box means no note.
   `js_note_essay.js`: one soft check under 20 words, timing, keystrokes; the text is kept for the
   interim page. The last batch-1 page carries `js_batch1_anchor.js`, which records when batch 1
   was submitted; that moment anchors T.
7. **Interim tasks** (`js_interim.js`): starts the reply job at once if a note exists. Five
   study-link checks, device, coding experience, instruction clarity. All forced.
8. **Batch 2** (added 2026-10-09): eight comments coded "while the coding supervisor reviews batch 1".
   Comments 2, 4 and 7 raise two problems, so the one-category tension stays live up to the reply.
   This fills the wait with work instead of a blank page.
9. **Waiting page** (`js_waiting.js`): "Batch 3 is waiting to be issued by the coding supervisor."
   Everyone stays until T = 90 s after the note was sent (without a note, 90 s after batch 1 was
   submitted). Batch 2 takes longer than that for nearly everyone, so the page usually advances at
   once. A reply is polled meanwhile; if it is not ready at T the page waits at most 60 s more,
   then the fallback for the cell is used and flagged. The page advances itself. Ten hidden text
   questions on the page carry the results.
   A note the service's blind check classes as non-voice gets `voice1 = 0` and the text
   "Note received."
10. **New messages** (`js_messages.js`): batch rating card for everyone; reply card only when a
   note was attached; "Batch 3 is ready" card. The reply is read from what the waiting page stored,
   retried for up to 20 s if it is not there yet. Next opens 15 s after the reply is on screen.
11. **Batch 3** (the former batch 2): eight comments; 3, 6 and 8 fit no category.
12. **Note 2 choice** with the "Review this batch" tool above it (`js_tools.js` counts opens into
    hidden questions; the "Why the rules are this way" tool was removed on 2026-10-08, so
    `why_opens_*` is always 0). Branch: attach → **Note 2** essay with the same tool.
13. **Questionnaire** (everyone): voice frequency (VF1–VF6) and voice quality improvement effort
    (VQ1–VQ4) from the study's off-survey scale document, in the past tense about what the
    participant did after batch 3 (2026-10-10); then authority (AUTH1–3) and safety/futility.
14. Branch `voice1 = 1` → **Manipulation checks**: reasons for the rejection (MR1–MR3
    supervisor-related, PR1–PR5 proposal-quality), then politeness (MA1–MA8: polite, courteous, sensitive to my feelings, respectful, considerate, appropriate, civil, tactful) and constructiveness (MC1–MC6, translated from the user's Chinese items).
15. **Closing**: one open question on whether anything felt unusual (the direct AI-suspicion question was removed), feedback, debrief. End of survey → Prolific.

## Embedded data

| Field | Written by | Meaning |
| --- | --- | --- |
| `condition` | randomiser | assigned cell, used only for a voice note |
| `batch1_submit_at`, `batch3_submit_at` | last batch-1 page; note 2 choice page | ISO time; batch 1's anchors T |
| `n2_button_order` | note 2 choice page | `attach_first` / `finish_first` |
| `note1_text`, `note2_text` | note pages | the notes (also saved as the essay answers) |
| `note*_opened_at`, `note*_submitted_at`, `note*_first_key_ms`, `note*_write_ms`, `note*_deletions`, `note*_words`, `note*_soft_check` | note pages | writing behaviour |
| `rejection_status` | waiting page | `ok`, `fallback`, or `none` (no note) |
| `rejection_msg1`, `rejection_msg2` | waiting page | the reply shown (fallback text when `fallback_used` = 1) |
| `rejection_compliance_code`, `rejection_latency_ms` | waiting page | from the service |
| `wait_before_t_ms`, `wait_after_t_ms`, `fallback_used` | waiting page | the wait, split at T |
| `politeness_channel` | waiting page | paragraph-2 channel drawn (`closing` for the fallback) |
| `voice1` | waiting page | `1` voice note, `0` non-voice note, empty if no note |
| `review_opens_*`, `why_opens_*`, `first_tool_open_ms_*` | note 2 pages | tool use on the choice page and the essay page |

Compliance code bits are as in `../survey_flow.md`. The `politeness_channel` can also be recomputed
from the ResponseID (sha256, first 32-bit word mod 4 over closing, appreciation, hedge, deference).

## Before collection

- `ALLOWED_ORIGINS` on the service must include `https://*.qualtrics.com`.
- Set T from the latency of the frozen wording (currently HP_HC slowest, median 40 s, max about
  80 s in QA): 90 s from the note covers nearly all; measure in the pilot.
- Replace `COMPLETION_CODE` in the end-of-survey redirect.
- The twenty-four comments are drafts; swap in the real corpus before the main run.
