# Part 1: Initial Manager Interaction

This document describes the `constructiveness_v2` manager interaction. It replaces the earlier rejection rules and examples.

## Participant Briefing

The participant acts as an Operations Team Member at Aetheria Gardens and works under the Park Manager.

The operations team checks tickets, scans QR codes, confirms visitor categories, guides visitors into the park, and answers simple visitor questions.

Aetheria Gardens has a staffing problem:

* In the off season, daily attendance falls to around 500 visitors, leaving excess idle capacity.
* In the peak season, daily attendance rises to around 5,000 visitors, leaving teams overwhelmed and short staffed.

The park currently relies almost entirely on full time permanent employees. The participant may suggest a more flexible employment model, such as using temporary staff or interns during high demand periods. They are free to suggest a different improvement instead.

Present the briefing across several short pages. Each page has one brief comprehension check covering:

1. The participant's Operations Team Member role and entrance responsibilities.
2. The off season surplus and peak season shortage.
3. The possible flexible labor suggestion.

Do not begin the manager chat until the checks are correct.

## Task Room Setup

What the task is, who runs it, that roles are assigned randomly, and which two roles exist are all stated on the page before the task room, where the participant can read at their own pace. The coordinator does not repeat any of it. Delivering the same description as seven scripted chat turns stretched the room past five minutes while the participant typed a median of thirteen words.

The coordinator and the manager both use standard punctuation and capitalisation. Loosening the coordinator's register toward how participants actually type was tried and reverted: it made a session coordinator running a paid study read as careless, and because each line has three variants, a run could draw several informal ones in a row and look sloppier than intended.

## Manager Opening

The manager opens with exactly three short messages:

1. Continue from the role assignment the participant already saw in the task room, then state that the manager can evaluate the participant's performance as an Operations Team Member.
2. State that the evaluation may affect the participant's compensation for this online task.
3. Ask what the participant thinks the theme park should do next.

The evaluation and the compensation stake are two messages rather than one sentence. Together they run past thirty words, which arrives as a wall of text in a chat bubble and buries the part that matters.

The manager does not re-announce the role assignment and does not explain the market research framing. Both were already delivered in the task room, and a manager who is supposedly another participant would not restate the sponsor's goals. Repeating them made the opening read as a fresh script rather than the same person continuing.

Do not mention staffing, flexible labor, or a proposal before the participant raises an idea.

The opening is neutral and identical in manipulation logic across all conditions.

## Constructiveness v2 Pipeline

The discussion and rejection are generated in separate internal steps.

### Step 1: Condition Blind Timing Decision

Before every first rejection decision, a classifier reads the conversation without receiving HP, LP, HC, or LC information.

It returns one of:

* `awaiting_proposal`: the participant has not yet voiced an improvement idea.
* `ask_followup`: the participant has voiced an idea but needs more room to explain it.
* `reject_now`: the proposal and the participant's reasons are sufficiently understood.

Any concrete suggestion about what the park should do counts as a proposal. It does not need to mention staffing or use any expected keyword.

The first substantive proposal must receive at least one follow up before rejection. The participant normally receives up to about three useful follow ups, with a higher turn count only as a runaway safety net.

### Step 2: Condition Blind Follow Up

All messages before rejection use the same neutral generator.

The manager asks exactly one open ended clarification question based only on what the participant already said.

The question must not:

* Reject or approve the proposal.
* Praise, thank, apologize, criticize, or dismiss.
* Diagnose a problem or consequence.
* State a performance standard.
* Suggest an improvement path.
* Introduce examples, answer choices, evidence requirements, risks, or solutions.
* Read any politeness or constructiveness rule.

Example:

> Manager: How would that work during the busiest periods?

### Step 3: Conditioned Rejection

Only after `reject_now` does the generator receive the assigned condition.

The rejection always stands for now. The participant can continue explaining or pushing back, but the manager does not approve the proposal during this interaction.

## Structured First Rejection

The first rejection contains exactly two Manager messages. Every English condition targets 58 to 60 words across the pair. The hard acceptance band is 54 to 62 words in total, while each individual message may contain 24 to 38 words so a harmless one-message imbalance does not fail an otherwise matched turn. The average length difference across conditions must remain below 5 percent. Each Chinese message is about 56 to 77 Chinese characters, with about 133 to 138 characters across both messages. Chinese messages must be complete, naturally punctuated sentences.

Message 1 contains:

* The assigned politeness style.
* A clear rejection for now.
* In HC, a proposal specific diagnosis.
* In LC, only a broad topic level dismissal.

Message 2 contains:

* In HC, an explicit standard and a concrete path for improving the proposal before reconsideration.
* In LC, an equally long vague judgment that adds no diagnostic or revision information.

The hidden HC structure contains:

* `proposal_problem`: one specific unresolved aspect of the actual proposal and its consequence.
* `relevant_standard`: one clear performance, service, safety, financial, feasibility, or operational criterion.
* `revision_path`: one concrete and actionable condition that could remedy the current problem before reconsideration.

The path follows the politeness condition. In HP it is redressed, for example by conditional wording such as `I would reconsider once...`. In LP it is expressed directly without redress, either as an imperative or a flat statement. LP does not manufacture a command merely to mark low politeness. The informational content of the HC path stays equivalent across HP and LP.

The hidden LC structure keeps all three fields empty. The visible reply may name the broad proposal topic, but must not communicate any specific problem, consequence, evidence type, standard, missing material, risk, or remedy.

The LC broad judgment vocabulary is split by politeness. HP LC uses mild vague judgments such as `needs more thought` or `does not quite fit the bigger picture yet`, never harsh adjectives. LP LC uses blunt vague judgments such as `not workable` or `nowhere near ready`. Both carry zero diagnostic information; the wording difference is exactly the politeness factor. Sharing one vocabulary made warm plus vague internally contradictory and produced heavy blind validation failures in that cell.

Data or evidence is not a required template. A lack of evidence may be selected as the problem only when it genuinely fits the participant's proposal.

For English and Chinese first rejections, the server may remove or add semantically empty modifiers or a neutral sentence saying the judgment concerns the current version to meet the matched total length. If an English pair remains outside the 54 to 62 word hard band, the server makes one length-only rewrite targeting 58 to 60 words. That rewrite is instructed to preserve the rejection, substantive components, future-step redress, and interpersonal cue direction and count. The rewritten pair then goes through the complete metadata, safety, semantic, cue-evidence, and length validation sequence again. If it still misses the band, the request fails rather than widening the experimental limit.

## Subsequent Rejection Turns

If the participant continues engaging, the manager replies in one 32 to 36 word English message or one roughly 52 to 60 character Chinese message per turn. Every later rejection explicitly repeats that the current version cannot be approved.

The window is deliberately narrow. A wider window let follow up turns drift to a 14 percent length spread across conditions, with low constructiveness consistently shortest.

In HC, every turn communicates:

1. One still unresolved problem in the participant's proposal and its consequence.
2. A clear relevant standard.
3. A concrete improvement condition, redressed in HP and expressed directly without redress in LP. LP may use an imperative or a flat statement, but no imperative is required.

In LC, every turn:

1. Recognizes only that the participant is still discussing the broad idea.
2. Keeps the rejection unchanged.
3. Adds no diagnosis, standard, evidence requirement, missing element, or improvement path.

There is no normal fixed cap on rejection rounds. The manager continues while the participant keeps explaining or defending the idea. The manager closes only after the participant accepts, disengages, or reaches the high runaway safety limit.

## Orthogonal Politeness Manipulation

Politeness changes interpersonal wording only. It must not add or remove substantive feedback.

For the same proposal:

* HP HC and LP HC use the same kind of proposal problem, standard, and improvement path.
* HP LC and LP LC remain equally broad and uninformative.

### Politeness as Face Work

Politeness follows Brown and Levinson: it is redressive face work accompanying a face threatening act, not warmth. High politeness performs that work, low politeness omits it and goes bald on record.

Positive politeness addresses the participant's wish to be approved of: acknowledging their contribution as a colleague whose thinking is known and valued, or validating the effort behind it.

Negative politeness addresses their wish not to be imposed upon: apologising for the imposition, deferring to their knowledge, hedging the refusal, or depersonalising it.

High politeness uses one redressive move per message and varies which kind it draws on. Receipt-of-message phrases such as `I hear you` or `noted` do not count: they acknowledge without performing any face work.

Low politeness performs neither kind, states the refusal in the manager's own voice, and attaches one face threat to the proposal per message. The threat targets the proposal, never the participant's intelligence, competence, or worth.

The quota is per message rather than per turn. The first rejection is two messages, and one move for the pair left the second reading as pure business.

### Redress of Refusals and Future Steps

An explicit refusal is not automatically impolite. `I cannot approve this version` counts as a polite refusal when appreciation, apology, hedging, deference, depersonalisation, or another redressive move is clearly attached to the refusal as a whole. The same explicit wording without face work counts as an unredressed refusal.

The scorer therefore judges the current refusal separately from any future next step. Under high politeness the current refusal and any future next step are redressed. Under low politeness the current refusal is unredressed, and any future next step that appears is also direct and unredressed.

Low politeness does not require a command. High constructiveness naturally includes a future remedy path, whereas low constructiveness may contain no future step at all. If LC mentions future handling, it remains vague and non-actionable; HP redresses it and LP states it directly.


### High Politeness

High politeness uses exactly one brief interpersonal cue such as:

* Appreciation or thanks.
* Understanding of why the participant raised the issue.
* An apology or softened rejection.
* Respectful hedging.
* A clear separation between the current proposal and the participant personally.

Example style:

> Manager: Thanks for explaining your thinking. I cannot approve this version for now.

### Low Politeness

Low politeness is direct, cold, curt, impatient, and dismissive.

It does not use:

* Thanks or appreciation.
* Praise or validation of effort.
* Apology.
* Warmth, deference, or hedging.

The face threat targets the proposal and uses exactly one sharp cue per message. Wording such as `this version is sloppy` or `this is nowhere near ready` is allowed, but attacks on the participant are prohibited.

Low politeness does not need to add a next-step line. In LP HC, the required concrete remedy is stated directly without redress and may be an imperative or a flat statement. In LP LC, no command is added merely to sound blunt; if future handling is mentioned naturally, it stays direct, vague, and non-actionable.

The manager must not replace constructive feedback with an attack on the participant's intelligence, competence, identity, or personal worth. Phrases that say or imply the participant is stupid, incapable, or did not think at all are prohibited.

Example style:

> Manager: I cannot approve this version. The proposal is nowhere near ready.

## Closing

The closing leaves the decision unchanged while keeping the possibility of future reconsideration open. Each English closing is 27 to 31 words, so the four conditions stay inside the same 5 percent length spread the first rejection is held to. An earlier wider window produced a 28 percent spread, with low constructiveness running shortest.

* HC names the concrete proposal focused condition that would need to be met before reconsideration.
* LC says only that the broad idea can be discussed again later.
* HP closes warmly and respectfully.
* LP closes coldly and grudgingly, without thanks, apology, praise, or a personal attack.

The generation target applies here too: exactly one politeness or dismissiveness cue per closing. Runtime validation uses the same one-to-two-cue tolerance and one-time trim procedure described below.

The manager then leaves the chat. The participant cannot re enter or revisit this stage.

## Independent Semantic Validation

Every first rejection and subsequent rejection is evaluated by a separate scorer that cannot see the assigned condition.

The scorer judges only the visible reply and conversation context:

* `specific_problem`
* `explicit_standard`
* `actionable_remedy`
* `current_rejection_maintained`
* `current_rejection_evidence`
* `current_rejection_redressed`
* `has_future_next_step`
* `future_next_step_redressed`
* `explicit_future_openness`
* `concrete_reopening_condition`
* `personal_attack_without_diagnosis`
* Per-message `politeness_cues`, returned as exact evidence excerpts
* Per-message `face_threat_cues`, returned as exact evidence excerpts
* Per-message `future_next_step`, returned as an exact evidence excerpt or an empty string
* Per-message `future_next_step_is_redressed`

Acceptance rules:

* Every condition requires a clear current rejection and prohibits personal attacks.
* HC requires the specific problem, explicit standard, and actionable remedy scores to be true.
* LC requires those three scores to be false.
* HP requires the current refusal to be redressed, one or two politeness cues per message, and zero face threat cues. Any future next step must also be redressed.
* LP requires the current refusal to be unredressed, one or two face threat cues per message, and zero politeness cues. A future next step is required in HC and in the closing, but not in an ordinary LC rejection; whenever it exists it must be direct and unredressed.
* Every closing keeps the current rejection and explicit future openness. HC names a concrete reopening condition; LC keeps the reopening path vague and non-actionable.

The generation prompt still targets exactly one intended interpersonal cue in every message. Validation is deliberately more tolerant because cue boundaries in natural language are unstable:

* One intended cue passes immediately.
* Two intended cues with no opposite-condition cue trigger one evidence-based request to simplify the message.
* If the retry still has two intended cues, it passes and the deviation is recorded in the AI request log.
* Zero intended cues, three or more intended cues, any opposite-condition cue, or a personal attack remains a hard failure on every attempt.

All cue requirements are applied message by message rather than to the combined turn. The same per-message standard applies at both constructiveness levels, so cue density cannot systematically vary with constructiveness. Refusal redress and future-step redress are judged as speech acts rather than inferred from imperative counts.

The blind scorer returns exact source excerpts rather than counts alone. The server checks that current-rejection evidence, every politeness or face-threat cue, and every future-next-step excerpt actually appears in the corresponding visible Manager message. Invalid or fabricated evidence cannot be used to pass the condition gate.

If hard validation fails, the rejection is regenerated up to two times. If all three attempts fail, the server returns a retryable error. A condition incorrect reply is never shown to the participant.

Final validation failures are retained for diagnosis in the internal AI request log. The `validation_failure` field stores the failed validation kind, exact correction cause, final candidate Manager messages, hidden constructiveness fields, and any available blind scores as JSON. These diagnostics are removed from the API response before it reaches the participant. When `AI_VALIDATION_DEBUG=true`, the same failed candidate and cause are also printed to the server log.

Existing safety checks remain active:

* The manager maintains the rejection outcome.
* The manager never reveals the experiment, manipulation, or that any role is generated.
* Participant facing messages do not display personal names.
* Replies use the requested language.
* Replies contain no dash like punctuation.
* Message count and length rules are enforced.
* Chinese rejection messages must be complete and naturally punctuated.

## Real Time Chat Behavior

The interaction should resemble a live workplace chat.

* Add a short natural delay before manager replies where technically possible.
* Do not show a typing indicator on every turn.
* Keep the participant input available while the manager is typing.
* If the participant sends another message during a pending reply, queue it or recalculate the pending response using the latest context.
* Do not use a fixed response script.

## Completion

When the manager leaves:

* Show that the manager is offline.
* Disable further messages in this chat.
* Mark the initial manager interaction complete.
* Show only the forward action to the next page.
* Do not provide any route back to the completed interaction.
