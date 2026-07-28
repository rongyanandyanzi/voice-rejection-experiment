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

## Manager Opening

The manager opens with exactly three short messages:

1. Explain that they have been assigned to the Park Manager role, can evaluate the participant's performance, and that the evaluation may affect the participant's compensation for this online task.
2. Explain that the task helps a market research company understand how teams respond to market needs and customer feedback.
3. Ask what the participant thinks the theme park should do next.

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

The first rejection contains exactly two Manager messages. Each English message is 30 to 36 words, and the two messages contain 66 to 70 words in total. The average length difference across conditions must remain below 5 percent. Each Chinese message is about 56 to 77 Chinese characters, with about 133 to 138 characters across both messages. Chinese messages must be complete, naturally punctuated sentences.

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

The mood of the path follows the politeness condition. In HP the path is phrased conditionally (`if you can come back with...`), never as a command. In LP the path may be one blunt imperative directive (`Come back with role counts and supervision ratios.`). The informational content of the path stays identical; only the directive mood differs, which is an interpersonal politeness channel.

The hidden LC structure keeps all three fields empty. The visible reply may name the broad proposal topic, but must not communicate any specific problem, consequence, evidence type, standard, missing material, risk, or remedy.

The LC broad judgment vocabulary is split by politeness. HP LC uses mild vague judgments such as `needs more thought` or `does not quite fit the bigger picture yet`, never harsh adjectives. LP LC uses blunt vague judgments such as `not workable` or `nowhere near ready`. Both carry zero diagnostic information; the wording difference is exactly the politeness factor. Sharing one vocabulary made warm plus vague internally contradictory and produced heavy blind validation failures in that cell.

Data or evidence is not a required template. A lack of evidence may be selected as the problem only when it genuinely fits the participant's proposal.

For English and Chinese first rejections, the server may remove or add semantically empty modifiers or a neutral sentence saying the judgment concerns the current version to meet the matched total length. The blind scorer evaluates the final adjusted text, so length handling cannot bypass the constructiveness check or add constructive content to LC.

## Subsequent Rejection Turns

If the participant continues engaging, the manager replies in one 34 to 36 word English message or one roughly 52 to 60 character Chinese message per turn. Every later rejection explicitly repeats that the current version cannot be approved.

The window is deliberately narrow. A wider window let follow up turns drift to a 14 percent length spread across conditions, with low constructiveness consistently shortest.

In HC, every turn communicates:

1. One still unresolved problem in the participant's proposal and its consequence.
2. A clear relevant standard.
3. A concrete improvement condition, phrased conditionally in HP and optionally as the single blunt imperative in LP.

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

### Interpersonal Cue Quota

Both politeness levels use exactly one interpersonal cue per turn, placed in a single clause. The cue is never stacked, repeated, or rephrased across sentences or across the two messages.

The quota exists because total length is matched across conditions. A low constructiveness reply has spare words that a high constructiveness reply spends on diagnosis. If those words go into extra warmth or extra dismissal, the politeness contrast becomes larger under low constructiveness than under high constructiveness, and the two factors stop being orthogonal.

Low constructiveness therefore spends its remaining length on neutral restatement of the broad topic and of the unchanged decision, never on additional interpersonal wording.

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

The face threat targets the proposal and uses exactly one sharp cue. Wording such as `this version is sloppy` or `this is nowhere near ready` is allowed once per turn.

Low politeness also owns the imperative directive mood: every LP rejection turn phrases exactly one next-step or wrap-up line as a blunt imperative in addition to the sharp cue, such as `Come back with actual numbers.` or `Don't bring it back until it includes the staffing numbers.` High politeness phrases the same content conditionally and never uses imperatives. In LP LC the imperative stays content-free, such as `Drop this version for now.`, so imperative frequency stays equal across the two constructiveness levels.

The manager must not replace constructive feedback with an attack on the participant's intelligence, competence, identity, or personal worth. Phrases that say or imply the participant is stupid, incapable, or did not think at all are prohibited.

Example style:

> Manager: I cannot approve this version. The proposal is nowhere near ready.

## Closing

The closing leaves the decision unchanged while keeping the possibility of future reconsideration open. Each English closing is 27 to 31 words, so the four conditions stay inside the same 5 percent length spread the first rejection is held to. An earlier wider window produced a 28 percent spread, with low constructiveness running shortest.

* HC names the concrete proposal focused condition that would need to be met before reconsideration.
* LC says only that the broad idea can be discussed again later.
* HP closes warmly and respectfully.
* LP closes coldly and grudgingly, without thanks, apology, praise, or a personal attack.

The interpersonal cue quota applies here too: exactly one politeness or dismissiveness cue per closing.

The manager then leaves the chat. The participant cannot re enter or revisit this stage.

## Independent Semantic Validation

Every first rejection and subsequent rejection is evaluated by a separate scorer that cannot see the assigned condition.

The scorer judges only the visible reply and conversation context:

* `specific_problem`
* `explicit_standard`
* `actionable_remedy`
* `personal_attack_without_diagnosis`
* `warmth_cues`: how many distinct warmth moves the reply makes.
* `face_threat_cues`: how many distinct sharp moves it aims at the proposal, including blunt imperative directives. Conditionally phrased suggestions do not count.

Acceptance rules:

* HC requires the first three scores to be true and the personal attack score to be false.
* LC requires the first three scores to be false and the personal attack score to be false.
* HP requires one or two warmth cues and zero face threat cues.
* LP requires one or two face threat cues and zero warmth cues.

The same one to two cue band applies at both constructiveness levels, so cue density cannot vary with constructiveness.

If validation fails, the rejection is regenerated up to two times. If all three attempts fail, the server returns a retryable error. A condition incorrect reply is never shown to the participant.

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
