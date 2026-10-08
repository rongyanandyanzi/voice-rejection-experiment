# The Coding Shift: Qualtrics survey

Built by `build_coding_shift_qsf.py` into `the_coding_shift.qsf`. Import as a **new** project
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
4. **Training**: categories and the rule; two practice comments with the answer shown on the next
   page. (The "Why the rules are this way" page was removed on 2026-10-07; the rationale remains
   available as a tool on the note 2 pages.)
5. **Batch 1**: eight comments, one per page, five categories each, forced. Comments 3, 6 and 8
   raise two problems.
6. **Note 1 choice**: "Attach a note to this batch" / "Finish this batch without a note", choice
   order randomised by Qualtrics (`js_note_choice.js` records the order and the batch-1 submit
   time, which anchors T). Branch: attach → **Note 1** essay (not forced; `js_note_essay.js`: one
   soft check under 20 words, timing, keystrokes; the text is kept for the interim page).
7. **Interim tasks** (`js_interim.js`): starts the reply job at once if a note exists. Five
   study-link checks, device, coding experience, instruction clarity. All forced.
8. **Waiting page** (`js_waiting.js`): "Batch 2 is waiting to be issued by the coding supervisor."
   Everyone stays until T = 120 s after batch 1 was submitted. A reply is polled meanwhile; if it
   is not ready at T the page waits at most 60 s more, then the fallback for the cell is used and
   flagged. The page advances itself. Ten hidden text questions on the page carry the results.
   A note the service's blind check classes as non-voice gets `voice1 = 0` and the text
   "Note received."
9. **New messages** (`js_messages.js`): batch rating card for everyone; reply card only when a
   note was attached; "Batch 2 is ready" card. Next after 15 s.
10. **Batch 2**: eight comments; 3, 6 and 8 fit no category.
11. **Note 2 choice** with the "Review this batch" tool above it (`js_tools.js` counts opens into
    hidden questions; the "Why the rules are this way" tool was removed on 2026-10-08, so
    `why_opens_*` is always 0). Branch: attach → **Note 2** essay with the same tool.
12. **Questionnaire**: VQ1–VQ4, three voice items, three authority items, safety and futility.
13. Branch `voice1 = 1` → **Manipulation checks** (politeness, constructiveness).
14. **Closing**: AI check (open and direct), feedback, debrief. End of survey → Prolific.

## Embedded data

| Field | Written by | Meaning |
| --- | --- | --- |
| `condition` | randomiser | assigned cell, used only for a voice note |
| `batch1_submit_at`, `batch2_submit_at` | note choice pages | ISO time; batch 1's anchors T |
| `n1_button_order`, `n2_button_order` | note choice pages | `attach_first` / `finish_first` |
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
  80 s in QA): 120 s covers it; measure in the pilot.
- Replace `COMPLETION_CODE` in the end-of-survey redirect.
- The sixteen comments are drafts; swap in the real corpus before the main run.
