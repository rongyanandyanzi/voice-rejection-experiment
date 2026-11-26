# The Coding Shift: Qualtrics survey

## Version 8 (2026-11-23)

Built by `build_coding_shift_qsf.py` into `the_coding_shift_v8.qsf`, imported as the new project
"The Coding Shift v8", **SV_50GDNKcRq0aETuS**, published. Every participant text is in
`coding_shift_v8_materials_2026-11-23.md`. Version 7 (SV_8IbAzIQqJXlIerk) is not changed; the server
is unchanged.

What differs from version 7:

1. **Report button in batch 3** (user decisions 2026-11-23). Under the category question of each
   batch 3 comment: `report_b3_N` (one-option checkbox that `js_report.js` shows as the button
   "Report this comment to the coding supervisor") and `report_b3_N_why` (optional one-line "What is
   the problem?", 150 characters, shown once the comment is reported). Voice frequency = number of
   comments reported, 0 to 8. Batches 1 and 2 have no button.
2. **No note page after comment 4.** The last note page (block "Workspace") is as in version 7.
3. The hidden leftovers of version 7 (`mid_choice`, `mid_remark`, `end_choice`, `end_remark` and
   their timers, the always-true flow branch) are not built. The "End choice" block is gone.
4. VF and VQ instructions name the reports and the note at the end.
5. The batch 3 intro (`batch3_intro`, QID55) is a page of its own and explains the report button in
   a highlighted box with a picture of the button (user request 2026-11-23; page break added in the
   live survey by hand).

6. **Heading of the questions about the reply** (user request 2026-11-23): "The supervisor's reply to
   your note on batch 1", with "batch 1" in red (`REPLY_HEADING`; MA, MC, REASON and Q107).
7. **Background questions** (user request 2026-11-23): `gender` QID106, `age` QID107, `education`
   QID108, `tenure` QID109, `industry` QID110, one page at the end of the Closing block after a page
   break, all forced. The open question before them is now titled "One more question about the shift".
   Added to the live survey by hand; the builder creates them last, so the QIDs match.
   The industry question is only "Which industry do you work in?" (user decision 2026-11-24: only
   employed participants are recruited, so no sentence about a most recent job).

8. **Attribution right after the reply** (user decision 2026-11-25, after the first 40 responses of
   24 November): `REASON` (QID100, PR1 to PR5) and `Q107` (QID101, MR1 to MR3) sit in a block of their
   own, "Attribution", in a branch for voicers (`h_voice1` = 1) between "New messages" and "Batch 3".
   "Manipulation checks" keeps `MA` and `MC` only. The batch 3 card on the messages page ends "Click
   Next to continue." Responses up to 24 November 2026 answered the attribution pages after the
   questionnaire.
9. **Rating and bonus on the batch 3 intro** (user requests 2026-11-25): `batch3_intro` (QID55) has
   a second highlighted box, "Your reports and your note are reviewed and rated". It announces the
   note at the end and says the supervisor will review what the coder sends in this batch, both the
   reports and the note, and rate it from 1 to 5, and that a high rating earns a bonus of £0.50.
   The first wording of the same day rated the note only; the user then asked that reporting count
   as voice too. It is the one place in the survey that names an amount. Live text: 2629
   characters, hash 826858756 (the live text keeps the editor's line breaks, so it differs from the
   builder's output in whitespace only).

10. **Batch 3 intro simplified** (user request 2026-11-26): `batch3_intro` (QID55) is now one opening
    line and three numbered points: 1 the report button, 2 the review of all 21 comments and the
    note at the end, 3 both count as suggestions to the supervisor, who reviews and rates them
    from 1 to 5, with a bonus of £0.50 for a high rating. The rating reminder line is no longer on
    this page. Live text equals the builder's output: 2631 characters, hash 2472433855.

11. **Report line in the constructive replies** (user request 2026-11-26): in `server.js` the written
    high-constructiveness rules tell the coder to report the count to the supervisor when they have
    solid numbers (HP: inside the tentative invitation; LP: as the bare imperative). The
    low-constructiveness replies never mention reporting. `writtenReportBackProblem` checks both and
    asks for one rewrite. The two HC backup texts in `js_waiting.js` carry the same line.

Notes for the next import:

- The background questions were added in the live editor with "编辑多个", which gives the choices the
  internal IDs 4, 5, 6 and so on. Their recode values were set to 1, 2, 3 and so on by hand
  ("重新编码值"), so the export matches the builder. A fresh import from the QSF has IDs 1, 2, 3 and
  needs no recode.

- `h_ws_meta` in version 8: `own_ticks;past_counts;tick_events;clears;tick_alls;first_tick_ms;page_ms`.
  `past_counts` holds each set cleared with "Untick all", sets separated by `/` (2026-11-23).
- The batch 3 intro says this is the final batch and that all 21 comments can be reviewed at its end;
  the report button is solid orange (2026-11-23).
- A freshly imported survey answers "Sorry! We were unable to find this survey" (code noForm) in
  preview until it has been **published once**. Publish first, then preview.
- Set in the editor after import, as before: "None of these" exclusive, report list in random order
  with the last option fixed, both Prolific header scripts (copied from version 7).
- The unused first imports SV_1LFp2Aw2nI9hBbM (version 8, button in all batches) and
  SV_87mCQHjImZFnnYa (version 7) were deleted on 2026-11-23 on the user's explicit instruction,
  one at a time, each confirmed by name and ID.
- In preview, do not click Next on the messages page before its 15 seconds are over, or the preview
  reports "Page is out of date".

## Version 7 (built 2026-11-16)

Built by `build_coding_shift_qsf.py` into `the_coding_shift_v7.qsf`. Imported on 2026-11-16 as the new
project "The Coding Shift v7" (SV_8IbAzIQqJXlIerk, draft until published); version 6
(SV_9oAznNcxPhujq3s) is not changed. An earlier import of the same day, SV_87mCQHjImZFnnYa, is
renamed "The Coding Shift v7 first import (not used)": it has the remark boxes as in-page questions.
Set in the editor after import: "None of these" exclusive, report list in random order with the last
option fixed, both Prolific header scripts (copied from version 5). Checked in preview: remark and
workspace branches, skipped pages on "go on" and "finish", carriers, debrief, redirect. Every participant text is in
`coding_shift_v7_materials_2026-11-16.md`. The server is unchanged.

Why: in versions up to 6 the second note was requested from everyone, so speaking up and the effort
put into it could not be told apart. Version 7 requests nothing after the reply.

1. **Consent**: 15 minutes; the supervisor gives each coder a rating from 1 to 5 at the end of the
   shift and the rating sets the bonus. No amount is named anywhere.
2. **Randomiser**: `condition` = HP_HC / HP_LC / LP_HC / LP_LC, as before.
3. **Training**: the scheme is under review this week, only the first note is requested, and the
   rating reflects the supervisor's overall impression. The rating rule never mentions notes and
   no participant text says what a good note looks like.
   Since 2026-11-17 (user request) the two paragraphs, "About this week" and "Your rating", are on
   a page of their own after the rules page: `training_notice` (QID94) with the page timer
   `t_training_notice` (QID95). Added to the live survey by hand; same QIDs as the builder.
4. **Batch 1**, **Note 1** (requested, with `h_note1_meta`), **Batch 2**, **Waiting page**: as in
   version 6. The admin tasks are not built.
5. **New messages**: the reply card and the "batch 3 is ready" card. The batch 1 check card ("Result:
   meets standard") was removed on 2026-11-23 (user decision); the count line says "2 new messages".
6. **Batch 3**: comments 2, 6, 8 raise two problems; 3, 5, 7 fit no category (5 is new: "Which
   university is running this research?"). Every page carries the line "The supervisor rates each
   coder at the end of the shift."
7. **Midpoint note** (after comment 4, inside the Batch 3 block; user decision 2026-11-20: no
   choice): `mid_remark` (QID57) is shown to everyone on its own page, optional, 200 characters,
   with the page timer `t_mid_note` (QID96). The old `mid_choice` (QID56) is hidden by the display
   condition `condition` = `never_shown`; it and `t_mid` make a page that is skipped.
8. **End choice** block: `end_choice` (QID75) is hidden the same way, so the block shows nothing;
   `end_remark` depends on it and never appears.
9. **Last note page** (block "Workspace", for everyone since 2026-11-20; the flow branch is kept
   with the always-true condition `condition` != `never_shown`): `workspace` (QID78; the 21 coded
   comments shown in full with tick boxes, built by `js_workspace.js`), `h_ws_meta`, `note2`
   (optional), `h_note2_meta`, `t_workspace`.
10. **Questionnaire**: VF and VQ with instructions about the part of the shift after the reply; VQ2
    and VQ3 reworded; report list as before.
11. **Manipulation checks** (branch `voice1` = 1): task attribution, social attribution, politeness,
    constructiveness, unchanged.
12. **Closing**: the open question. **Debrief**: full bonus for everyone, the reply was part of the
    study; no amount and nothing on how the reply was produced.

Look (2026-11-23, user request): one colour per batch (1 blue, 2 green, 3 purple, practice grey) as a
solid badge at the top of every page of the batch and as the tint and bar of the comment card; the
comment is 22 px, larger than the answer options. VF and VQ instructions reworded the same day to
name the reply and the two chances to leave a note. Applied to the live survey through the editor's
own question objects (33 question texts, each checked by hash before and after) and published.

Measures: voice frequency = notes written after the reply (`mid_remark` and `note2` non-empty), 0
to 2. Effort = coded content of what was sent plus `h_ws_meta`:
`own_ticks;first_tick_ms;page_ms` (ticks are `batch-number`, joined by `|`).

After import, set in the editor as for version 6: "None of these" exclusive and the report list in
random order with the last option fixed; the two Prolific header scripts; check the end-of-survey
redirect.

## Versions up to 6

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
   soft check (since 2026-10-28: when the note is under 20 words or mentions nothing about the rules or categories; reason recorded in the hidden carrier h_note1_meta, see below) and the timing. Since 2026-10-28 each note page carries one hidden text-entry question (h_note1_meta / h_note2_meta) holding `words=..;write_ms=..;first_key_ms=..;deletions=..;soft=..`, because embedded data written by page scripts never reached the export in pilots 1–8 (every note1_*/note2_* column empty); the embedded-data fields stay declared but are not relied on. The request frames the note as input to a rule review and asks what the coder would change and why (2026-10-28). The text is kept for the next page. The last batch-1
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
    the request is deliberately soft (no question, no "nothing to add" line, 2026-10-28); no soft check. The voice measure is the coded content of note 2
    (silence = nothing to add). Live survey: the old attach/finish question is hidden, not deleted,
    and its flow branch is left empty; Note 2 sits at top level before the Questionnaire.
13. **Questionnaire** (everyone; opens with a "The coding shift is complete" page): voice frequency (VF1–VF6) and voice quality improvement effort
    (VQ1–VQ4) from the study's off-survey scale document, in the past tense about what the
    participant did after batch 3 (2026-10-10). Authority and safety/futility were removed on
    2026-10-10.
14. Branch `voice1 = 1` → **Manipulation checks**: reasons for the rejection on two pages, split
    into two questions (REASON: PR1–PR5 task attribution, the rejection is due to the note; Q107: MR1–MR3 social attribution, the rejection is due to the supervisor; items reworded to the coding context on 2026-10-28, same column names),
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
