# Qualtrics survey flow: one-shot rejection design

The chat rooms are gone. Cover story: a market research company runs paid outside-review sessions
for businesses; the park's owner wants the operations manager's staffing plan reviewed by outsiders
before it goes ahead; the manager who drew up the plan answers each review in writing during the
session and rates it for usefulness (the rating decides the bonus, which is in fact paid to everyone).
The participant writes one review, reads the notes supplied with the plan while "the manager
replies", reads the rejection in a message box, reads the second background materials, and may send
the same manager a further note. Qualtrics hosts every page and stores every variable. The only outside call is
to the generation service (`/api/rejection/start` and `/api/rejection/result`), made from question
JavaScript on the waiting page. Nothing about the study is stored on that service.

Files in this folder:

| File | Where it goes |
| --- | --- |
| `js_consent_warmup.js` | Question JavaScript on the consent page |
| `js_proposal_minwords.js` | Question JavaScript on the proposal essay question |
| `js_waiting_page.js` | Question JavaScript on the waiting page (sent notice + extra facts) |
| `manager_message_card.html` | HTML of the Text/Graphic question on the manager message page |
| `js_manager_message.js` | Question JavaScript on that same Text/Graphic question (fills the card if a piped value is empty) |
| `js_hidden_field.js` | Question JavaScript on the six hidden single-line Text Entry questions of the waiting page |
| `js_voice_timestamps.js` | Question JavaScript on the second suggestion essay question |
| `extra_facts.md` | Draft text for the waiting page, to be approved before use |

In every JavaScript file replace `https://YOUR-SERVICE.onrender.com` with the service origin.

## Survey Flow, top to bottom

1. **Embedded Data** (must be the first element, so every field exists before JavaScript writes it).
   Declare with no value unless stated: `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID` (Qualtrics fills
   these from the URL query string), `condition`, `proposal`, `rejection_job`, `rejection_status`,
   `rejection_wait_ms`, `rejection_msg1`, `rejection_msg2`, `rejection_compliance_code`,
   `rejection_latency_ms`, `voice_start`, `voice_submit`, `voice_text`, `briefing_wrong`.
2. **Block: Consent.** The task description (a market research company collecting outside reviews
   of a client's plan; the manager who drew up the plan answers and rates each review; useful reviews
   earn a bonus) plus a willing / not willing question. `js_consent_warmup.js` on the text question. Branch: if not willing, End of
   Survey (no completion code).
3. **Randomizer**, "Evenly Present Elements", present 1 of 4. Each element is an Embedded Data
   element setting `condition` to `HP_HC`, `HP_LC`, `LP_HC` or `LP_LC`.
4. **Block: Background.** Three Text/Graphic pages: the park and its entrance team (no job role for
   the participant; the operations manager drew up the plan under review), the plan under review with
   last year's figures, and "Your review" (the manager did not ask for the reviews, the owner did; the
   manager can decline, rates every review, the rating decides the bonus; the review carries the
   reviewer ID; the manager answers during today's session). Below each page a reading-check item (single answer, Request Response). Branch after the
   three checks: if any answer is wrong, set `briefing_wrong` = 1 and show a one-page "Please read
   the information again" block with the same material, then continue regardless.
5. **Block: Proposal.** One Text Entry question, Essay box, Request Response, with
   `js_proposal_minwords.js`. Prompt:
   "Your review of the staffing plan. Say what is wrong with the current plan, what the park should
   do instead, and why. It goes to the operations manager who drew up the plan, who will read it,
   rate it, and reply to you here." (Minimum 20 words, enforced by the script.)
6. **Block: Waiting page.** One Text/Graphic question whose HTML starts with a short notice
   ("Your review has been sent to the operations manager. The manager is answering reviews during
   this session; replies usually arrive within a few minutes. While you wait, here are the notes the
   park supplied with the plan.") followed by the content of `extra_facts.md`.
   Attach `js_waiting_page.js`. Below it, on the same page, six hidden single-line Text Entry
   questions in this order: rejection_status_q, rejection_msg1_q, rejection_msg2_q,
   rejection_code_q, rejection_latency_q, rejection_wait_q (each with `js_hidden_field.js`, not
   forced). The script writes the reply into them, because in the current survey engine values set
   with setEmbeddedData are not readable by later JavaScript and were not reliable for branch logic
   in preview; question answers are always saved with the page. Then a Timing question with no
   auto-advance and no submit delay; the script controls the Next button. Defaults in the script: minimum 60 s on the page,
   give up after 300 s, poll every 3 s, up to three job starts. The service itself re-runs a failed generation once, so a "failed" status means two full generations failed.
7. **Branch:** if the hidden question `rejection_status_q` is not equal to `ok`, End of Survey element with a custom message
   ("A technical problem stopped the study. Please return to Prolific and use the completion code
   below so you are paid for your time.") and the technical-issue completion code or redirect. These
   responses are excluded from analysis.
8. **Block: Manager message.** One Text/Graphic question with `manager_message_card.html` (header
   "Review session · Client: Aetheria Gardens", sender "Operations Manager, Aetheria Gardens", footer
   "Manager's decision on this review: not taken forward. Usefulness rating recorded."), plus a
   Timing question with "Enable submit after" 20 seconds. Optional short line under the card: "Click
   Next when you have read the reply."
9. **Block: Second materials.** Three Text/Graphic pages copied from `app.js` (`transitionPages`,
   about lines 466 to 520): Off-Season Situation, Visitor Pattern, Nearby Visitors, keeping the bold
   numbers. Same "Enable submit after" timing as now if you want a minimum read time.
10. **Block: Second suggestion (voice DV).** One Text Entry question, Essay box, not forced, with
    `js_voice_timestamps.js`. Prompt: "A further note to the manager (optional). If you have a
    suggestion about the off-season situation you have just read, you can send it to the same
    operations manager. It will be read and rated in the same way, and the rating affects your bonus
    in the same way. Write it below, or leave the box empty if you have nothing to add." Do not
    mention the earlier rejection on this page.
11. **Block: Scales.** The VF and VQ items in their one-shot wording (see `06_post_interaction_survey.md`,
    "One-shot (Qualtrics) variant"), then the manipulation checks (perceived politeness, perceived
    constructiveness) and the other existing scales. Manipulation checks come after the DV so they do
    not prompt the participant before the second suggestion.
12. **Block: AI check.** Three pages in this order, one question each, wording taken from `app.js`
    (`renderAiCheckOpenPage` and `renderAiCheckDirectPage`): "Did anything about the interaction feel
    unusual or unexpected? Please describe briefly." (text), "Who do you think you were interacting
    with in the chat?" reworded to "…in the message exchange?" (text), then the direct yes / no /
    not sure question with the "studies may sometimes include AI participants" preamble.
13. **Block: Feedback.** Task feedback text box, then a short closing page stating that every
    participant receives the bonus regardless of the manager's rating (the bonus is paid to
    everyone after the study; say so in the ethics application and the Prolific description).
14. **End of Survey:** redirect to the Prolific completion URL.

## Embedded data dictionary

| Field | Written by | Meaning |
| --- | --- | --- |
| `condition` | Randomizer | HP_HC, HP_LC, LP_HC, LP_LC |
| `proposal` | proposal page script | The participant's first suggestion, trimmed |
| `rejection_job` | waiting page script | Job id used on the service (equals ResponseID) |
| `rejection_status` | waiting page script | `ok` or `failed` |
| `rejection_wait_ms` | waiting page script | Time from page load to reply or give-up |
| `rejection_msg1`, `rejection_msg2` | waiting page script | The two manager paragraphs shown on the message page |
| `rejection_compliance_code` | waiting page script | Integer; decode with the bit table below |
| `rejection_latency_ms` | waiting page script | Generation time on the service |
| `voice_start`, `voice_submit` | voice page script | ISO timestamps for the second suggestion page |
| `voice_text` | voice page script | The second suggestion, trimmed (also stored as the question answer) |
| `briefing_wrong` | branch logic | 1 if any briefing check was answered wrongly |

Compliance code bits (add the values of the flags that are true; 512 means the blind scorer ran):

| Bit | Flag |
| --- | --- |
| 1 | specific_problem |
| 2 | explicit_standard |
| 4 | actionable_remedy |
| 8 | current_rejection_redressed |
| 16 | future_next_step_redressed |
| 32 | explicit_future_openness |
| 64 | concrete_reopening_condition |
| 128 | personal_attack_without_diagnosis |
| 256 | current_rejection_maintained |
| 512 | scored |

Expected pattern: HC cells carry 1, 2 and 4; LC cells carry none of them; HP cells carry 8 (and 16
when a future step is present); LP cells carry neither 8 nor 16; 128 must never be set. A response
that breaks its cell's pattern is a manipulation failure and should be excluded, exactly as the QA
harness gates would have rejected it.

## Prolific

Study link: the Qualtrics anonymous link with
`?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}`.
The End of Survey element redirects to the Prolific completion URL; the technical-problem End of
Survey uses a separate completion code so those participants can be paid and identified.

## Service settings that matter here

`ALLOWED_ORIGINS` on the service must list the survey origin(s), for example
`https://*.qualtrics.com`. The consent page ping wakes a sleeping free instance; the waiting page
script tolerates a still-sleeping instance by restarting the job when the first start is lost.
