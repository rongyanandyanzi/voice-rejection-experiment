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
4. **Training**: one page with the five categories, then two practice comments, each raising a
   single problem. The rule box on the practice pages says only "choose one category" and "no
   other option"; since 2026-10-10 nothing in the survey tells coders what to do with a comment
   that raises two problems.
5. **Batch 1**: opens with its own "Batch 1 of 3" page (2026-10-11); eight ordinary end-of-study comments, one per page, five categories each, forced.
   Comments 3, 5, 6 and 8 raise two problems.
6. **Note 1** (required since 2026-10-12; in the pilot only 4 of 20 wrote the optional note): the
   coding supervisor asks every coder for comments on the coding of batch 1 - whether anything in the
   rules or categories does not work, problems met while coding, suggestions - and to comment on the
   coding rather than on the studies the comments describe (steered to the rules since 2026-10-12,
   after pilot 2 notes drifted to the studies). `js_note_essay.js` keeps the
   soft check under 20 words and the timing. The text is kept for the next page. The last batch-1
   page carries `js_batch1_anchor.js`. A note the blind check classes as non-voice still gets
   "Note received." Note 2 is also required since 2026-10-12 (see step 12).
6b. **What happens next** (added 2026-10-11, `js_interim.js`): with a note, "Your note is with the
   coding supervisor ... is being reviewed"; without, "Batch 1 has been submitted ... is being
   checked". Lists the next steps and starts the reply job here.
7. **Interim tasks** (`js_interim.js`): starts the reply job if the previous page did not. Five
   study-link checks, device, coding experience, instruction clarity. All forced.
8. **Batch 2** (added 2026-10-09; five comments since 2026-10-10): comments coded "while the coding supervisor reviews batch 1".
   Comments 2, 4 and 5 raise two problems, so the one-category tension stays live up to the reply.
   This fills the wait with work instead of a blank page.
9. **Waiting page** (`js_waiting.js`): "Batch 3 is waiting to be issued by the coding supervisor."
   Everyone stays at least 10 s on this page (since 2026-10-19) and until T = 60 s after the note was sent (90 s until 2026-10-19; without a note, 60 s after batch 1 was
   submitted). Batch 2 takes longer than that for nearly everyone, so the page usually advances at
   once. A reply is polled meanwhile, and the page waits for it however long it takes (since
   2026-10-12: everyone with a note gets the AI reply). Only if the service is down and nothing has come after 4 minutes on the page is the fallback used and flagged. The page advances itself. Ten hidden text
   questions on the page carry the results.
   A note the service's blind check classes as non-voice gets `voice1 = 0` and the text
   "Note received."
10. **New messages** (`js_messages.js`): batch rating card for everyone; reply card only when a
   note was attached; "Batch 3 is ready" card. The reply is read from what the waiting page stored,
   retried for up to 20 s if it is not there yet. Next opens 15 s after the reply is on screen.
11. **Batch 3** (the former batch 2; intro "Batch 3 of 3, the last batch" on the first page): eight comments; since 2026-10-20 comments 2, 5, 6 and 8 raise two problems (like batch 1, so the rejected issue can be raised again with a count) and 3 and 7 (both requests) fit no category. Definitions tightened the same day: LENGTH = duration/pace incl. advertised time, PAYMENT = money only, CONTENT = unsuitable question (renamed from "question content" on 2026-10-21 after it absorbed praise and vague-question comments; reactions such as interest fit nowhere). Since 2026-10-21 the note 2 intro page shows the batch 3 coding in full and the note 2 page shows the participant's note 1 and the supervisor's reply above the box.
12. **Note 2 intro** (block still named "Note 2 choice") with the "Review this batch" tool above it
    (`js_tools.js` counts opens into hidden questions; the "Why the rules are this way" tool was
    removed on 2026-10-08, so `why_opens_*` is always 0). Since 2026-10-12 everyone goes on to
    **Note 2**: the supervisor asks for comments on the coding of batch 3, the answer is required and
    "nothing to add" is allowed; no soft check. The voice measure is the coded content of note 2
    (silence = nothing to add). Live survey: the old attach/finish question is hidden, not deleted,
    and its flow branch is left empty; Note 2 sits at top level before the Questionnaire.
13. **Questionnaire** (everyone; opens with a "The coding shift is complete" page): voice frequency (VF1–VF6) and voice quality improvement effort
    (VQ1–VQ4) from the study's off-survey scale document, in the past tense about what the
    participant did after batch 3 (2026-10-10). Authority and safety/futility were removed on
    2026-10-10.
14. Branch `voice1 = 1` → **Manipulation checks**: reasons for the rejection on two pages, split
    into two questions (REASON: PR1–PR5 proposal-based; Q107: MR1–MR3 supervisor-based; items reworded to the coding context on 2026-10-28, same column names),
    then politeness (MA1–MA8: polite, courteous, sensitive to my feelings, respectful,
    considerate, appropriate, civil, tactful) and constructiveness (MC1–MC6, translated from the
    user's Chinese items).
15. **Closing**: one open question on whether anything felt unusual. Task feedback and the
    debrief were removed on 2026-10-10. End of survey → Prolific.

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
  80 s in QA): 60 s from the note (90 s until 2026-10-19) plus batch 2 covers nearly all; measured in pilots 1-4.
- Completion code C184ZVR9 is set in the end-of-survey redirect (2026-10-11).
- The twenty-four comments are drafts; swap in the real corpus before the main run.
