# Post-Interaction Survey Requirements

## Purpose

After the second manager interaction ends, or after the participant chooses not to enter the second manager interaction, the participant should complete a post-interaction survey.

The survey should measure:

1. Voice frequency
2. Voice quality improvement effort
3. Perceived reasons for the first manager's rejection of the labor plan suggestion

The survey should look and feel like a Qualtrics-style questionnaire.

The survey should use 1-5 Likert scales.

All survey items must be answered before the participant can proceed.

Do not reveal the experimental purpose to participants.

Do not show internal variable names such as `VF1`, `VQ1`, `MR1`, or `PR1` to participants.

Do not reveal the assigned condition to participants.

Do not reveal that the manager is AI-generated.

## Placement in Experiment Flow

This survey page should appear after the second manager interaction ends, or after the participant chooses not to enter the second manager interaction.

The second manager interaction refers to the neutral manager follow-up interaction after the participant chooses to discuss their thoughts about the off-season situation with the manager.

The sequence should be:

1. The participant completes the first manager interaction about the flexible labor proposal.
2. The participant reads the additional materials about the theme park's off-season situation.
3. The participant decides whether to discuss their thoughts about this situation with the manager.
4. If the participant chooses yes, the participant enters the second manager interaction.
5. After the second manager interaction ends, the post-interaction survey page appears.
6. If the participant chooses no, the system should skip the second manager interaction and go directly to the post-interaction survey page.
7. The participant completes all survey items.
8. The participant proceeds to the AI-check page.
9. The participant answers whether the manager may have been AI.
10. The participant proceeds to the completion page.

The survey must be completed by all participants who reach the end of the materials decision.

The survey should not depend on whether the participant chose to speak with the manager again.

## Survey Page Title

Post-Interaction Questions

## General Survey Instructions

Display this instruction at the top of the survey page:

Please answer the following questions based on your experience in this study. There are no right or wrong answers. Please indicate the extent to which you agree with each statement.

## Likert Scale

Use the following 1-5 Likert scale for all survey items:

1 = Strongly disagree  
2 = Disagree  
3 = Neither agree nor disagree  
4 = Agree  
5 = Strongly agree  

## Survey Layout

The survey is presented one section per page, in the order the sections are listed below, with a `Page X of N` line under the title. Each page shows that section's title, instruction, stem if it has one, and its matrix. The button reads `Continue` on every page but the last, where it reads `Submit`. A page cannot be left until every item on it is answered. There is no way back to an earlier page. Answers are held in a local draft so that a refresh resumes on the same page; the survey row is posted once, when the last page is submitted. `survey_start_time` is when the first page was shown and `survey_submit_time` is when the last page was submitted; each page shown is recorded in interactions.csv, and each page submitted is recorded there together with that page's answers, so every completed page is held on the server even if the participant abandons the survey before the final submit.

Within a page, the section is presented in a Qualtrics-style matrix format.

For each section:

- Display the section title.
- Display the instruction or stem.
- Display each item as one row.
- Display response options 1 to 5 as columns.
- Use radio buttons for responses.
- Each row should allow only one response.
- Every item should be required.
- The participant should not be able to continue until all items on the current page are answered.

Recommended column labels:

| Item | 1 Strongly disagree | 2 Disagree | 3 Neither agree nor disagree | 4 Agree | 5 Strongly agree |

For small screens, the layout should remain readable. If needed, use a mobile-friendly layout where each item is shown with five radio options underneath.

## Sections 1 and 2: The Second Conversation

Sections 1 and 2 are retrospective self-reports on the second manager conversation. They replace the earlier future-tense intention items, which were shown after that conversation had already taken place. Every item can be answered by a participant who raised nothing: the frequency items then attract disagreement, and the quality items are anchored to the preparation phase. No gate question is used and no item is skipped.

### Shared instruction

Displayed above Section 1 only, in bold red. Section 2 carries no instruction; its items each begin with the reference period instead.

```text
The following statements are about the second conversation you had with the manager, the one after you had reviewed the customer feedback. Please indicate how much you agree with each statement about what you actually did.
```

## Section 1: Raising Ideas in the Second Conversation

Voice frequency.

#### VF1

I proposed specific improvements to the manager more than once.

#### VF2

I made a point of raising new ideas about the visitor issue with the manager.

#### VF3

Even when the manager seemed unresponsive, I kept putting forward my views.

#### VF4

I used the opportunities in the conversation to share my ideas proactively.

#### VF5

I brought my own ideas into the conversation rather than only answering the manager's questions.

#### VF6

I offered my own suggestions and ideas repeatedly.

## Section 2: Preparing Your Suggestion

Voice quality improvement effort: effort directed at specific quality features of a suggestion. The four items map one to one onto the behavioural sub-scores in `code_voice_behavior.py` (evidence, concerns, clarification, actionable), so self-reported prepared quality and coded delivered quality can be compared.

#### VQ1

Before the second conversation with the manager, I tried to back what I might suggest with the information available to me, such as the entrance records, visitor comments, or location details.

#### VQ2

Before the second conversation with the manager, I made an effort to think through the practical concerns a manager would have, such as visitor demand, feasibility, or park operations.

#### VQ3

Before the second conversation with the manager, I tried to anticipate the questions or doubts the manager might raise, and how I would answer them.

#### VQ4

Before the second conversation with the manager, I made an effort to work out a clear, actionable course of action rather than a general idea.

## Section 3: Perceived Reasons for Manager Response

### Section Title

Perceived Reasons for Manager Response

### Instruction

Please indicate why you think the manager rejected your suggestion about the labor plan.

### Stem

The manager rejected my suggestion because...

### Subsection 3A: Manager-Related Reasons

#### MR1

The manager was influenced by their emotions.

#### MR2

The manager wanted to demonstrate their authority.

#### MR3

The manager personally disliked me.

### Subsection 3B: Proposal-Related Reasons

#### PR1

My proposal for improvement was mediocre.

#### PR2

My suggestion did not really improve the current methods or practices.

#### PR3

The changes I suggested for work arrangements did not really help much.

#### PR4

I made impractical recommendations about how to fix work-related problems.

#### PR5

My suggestion was not very useful.

## Section 4: Perceived Tone of Manager Response
### Section Title

Perceived Tone of Manager Response

### Instruction:

Please indicate how you perceived the manager’s attitude when they rejected your suggestion about the labor plan.

Stem:
The manager’s response was...

Use the same 1–5 Likert scale:
1 = Strongly disagree
2 = Disagree
3 = Neither agree nor disagree
4 = Agree
5 = Strongly agree

Items:
MA1. Polite
MA2. Courteous
MA3. Sensitive to my feelings
MA4. Respectful toward me
MA5. Considerate toward me
MA6. Appropriate
MA7. Civil
MA8. Tactful

## Section 5: Perceived Usefulness of Manager Response

## Section Title

Perceived Usefulness of Manager Response

## Instruction

Please indicate how you perceived the manager’s response when they rejected your suggestion about the labor plan.

## Stem

When rejecting my suggestion, the manager...

## Likert Scale

1 = Strongly disagree  
2 = Disagree  
3 = Neither agree nor disagree  
4 = Agree  
5 = Strongly agree  

## Items

These items are adapted from the destructive criticism and feedback constructiveness literature. The original wording asks about performance feedback directed at the respondent personally: identifiable behaviors, my weaknesses, standards for acceptable behavior, problematic incidents.

That framing does not fit this paradigm. The manager evaluates a proposal the participant volunteered, and is instructed never to criticise the participant's intelligence, competence, effort, identity, or personal worth. Items phrased around the participant's own deficiencies therefore ask about something the design deliberately never provides, and a truthful high constructiveness participant has to disagree with them.

Each item below refers to the proposal rather than the respondent. Report the adapted wording and fresh reliability rather than citing the source scale's psychometrics.

### MC1

Pointed to specific aspects of my proposal that I could actually work on.

### MC2

Suggested that the problems with my proposal could be fixed.

### MC3

Made reference to clear, legitimate standards my proposal would have to meet.

### MC4

Was very specific and detailed.

### MC5

Made reference to specific parts of my proposal that were problematic.

### MC6

Provided clear enough guidance that I knew what to change.

Each item maps onto one component of the high constructiveness manipulation, so the check covers what the manipulation actually delivers:

| Item | Manipulation component |
| --- | --- |
| MC1, MC5 | `proposal_problem` |
| MC3 | `relevant_standard` |
| MC2, MC6 | `revision_path` |
| MC4 | Overall specificity |



## Required Response Rules

All survey items are required.

The participant cannot proceed until all items are answered.

If the participant clicks Submit before answering all items, show a neutral validation message:

Please answer all questions before continuing.

Do not highlight this as an error in a harsh or alarming way.

## Submit Button

At the bottom of the survey page, show a button:

Submit

After the participant clicks Submit and all items are answered:

1. Save all survey responses.
2. Record survey completion status.
3. Move the participant to the AI-check page.

## AI-Check Pages After Survey

After the Post-Interaction Questions page is submitted, show three pages before the completion page. Each page holds one question, each is locked once submitted, and there is no way back. The first two questions never mention AI; the third is the pilot's direct item, kept verbatim.

Page 1, an open question with a required text box. Writing `No` is a valid answer.

```text
Did anything about the interaction feel unusual or unexpected? Please describe briefly.
```

Page 2, an open question with a required text box. It says `in the chat` rather than naming the manager, so it does not point the participant at any one character.

```text
Who do you think you were interacting with in the chat?
```

Page 3 is the pilot's page, unchanged. Display the following text:

```text
In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the questions below.
```

Then ask the following required question, with required radio-button options Yes, No, and Not sure:

```text
Do you think the manager you interacted with may have been AI?
```

The preamble on page 3 primes the participant that AI may be involved, and the wording of page 3 asks about the manager while the preamble says participants. Neither is changed, because page 3 exists only to stay comparable with the data already collected. Both quirks are noted in the methods. The order and the page separation are what keep page 3 from contaminating pages 1 and 2, so neither may be changed.

Page 1 and page 2 answers are coded after collection, on a coded sheet with a human audit, into an ordered suspicion level: 3 if page 1 spontaneously mentions AI, a bot, a robot, automation, a script, a chatbot, or not a real person; 2 if page 1 does not but page 2 answers AI; 1 if neither does but page 3 is Yes; 0 otherwise. Page 2 is also coded into human, AI, unsure, or other.

After page 3 is submitted, move the participant to the completion page.

## Data Recording Requirements

Survey responses must be saved with the participant's Prolific information and assigned experimental condition.

Record the following identifiers with every survey response:

- `prolific_pid`
- `study_id`
- `session_id`
- `assigned_condition`
- `condition_source`

Record the following timing information:

- `survey_start_time`
- `survey_submit_time`
- `survey_completion_status`

Record all item responses as numeric values from 1 to 5.

Record the AI-check responses at the participant level:

- `completed_ai_check`
- `ai_check_start_time`
- `ai_check_submit_time`
- `manager_ai_suspicion`
- `lisa_ai_suspicion`
- `john_ai_suspicion`

## Recommended Data File

Create a separate file:

- `survey_responses.csv`

If generating Excel output, add a third sheet:

- `survey_responses`

The Excel workbook should contain:

1. `participants`
2. `interactions`
3. `survey_responses`

## survey_responses.csv Columns

Use the following columns:

- `prolific_pid`
- `study_id`
- `session_id`
- `assigned_condition`
- `condition_source`
- `survey_start_time`
- `survey_submit_time`
- `survey_completion_status`
- `VF1`
- `VF2`
- `VF3`
- `VF4`
- `VF5`
- `VF6`
- `VQ1`
- `VQ2`
- `VQ3`
- `VQ4`
- `MR1`
- `MR2`
- `MR3`
- `PR1`
- `PR2`
- `PR3`
- `PR4`
- `PR5`

## Variable Definitions

### prolific_pid

The participant's Prolific ID from the URL parameter `PROLIFIC_PID`.

If missing, record `missing`.

### study_id

The Prolific study ID from the URL parameter `STUDY_ID`.

If missing, record `missing`.

### session_id

The Prolific session ID from the URL parameter `SESSION_ID`.

If missing, record `missing`.

### assigned_condition

The participant's assigned experimental condition.

Allowed values:

- `HP_HC`
- `HP_LC`
- `LP_HC`
- `LP_LC`

### condition_source

How the condition was assigned.

Allowed values:

- `url`
- `random_assignment`

### survey_start_time

The timestamp when the survey page is first displayed.

Use a consistent timestamp format, such as ISO 8601.

Example:

```text
2026-05-09T16:30:25.123+08:00
```

### survey_submit_time

The timestamp when the participant successfully submits the survey.

### survey_completion_status

Record whether the participant completed the survey.

Allowed values:

- `completed`
- `partial`
- `not_reached`

### VF1-VF6

Voice frequency items.

Allowed values:

- `1`
- `2`
- `3`
- `4`
- `5`

### VQ1-VQ4

Voice quality improvement effort items: effort directed at specific quality features, anchored to the preparation phase before the second conversation.

Allowed values:

- `1`
- `2`
- `3`
- `4`
- `5`

### MR1-MR3

Manager-related perceived rejection reason items.

Allowed values:

- `1`
- `2`
- `3`
- `4`
- `5`

### PR1-PR5

Proposal-related perceived rejection reason items.

Allowed values:

- `1`
- `2`
- `3`
- `4`
- `5`

## Participant-Level Data Update

Update the participant-level data file to include survey completion information.

In `participants.csv`, add or update the following columns if they do not already exist:

- `completed_post_interaction_survey`
- `survey_completion_status`
- `survey_start_time`
- `survey_submit_time`

When the participant reaches the survey page, set:

```text
completed_post_interaction_survey = false
survey_completion_status = partial
```

When the participant submits all required survey items, set:

```text
completed_post_interaction_survey = true
survey_completion_status = completed
```

If the participant exits before reaching the survey page, set:

```text
completed_post_interaction_survey = false
survey_completion_status = not_reached
```

## Interaction-Level Data Update

In `interactions.csv`, record that the survey page was displayed.

Use:

```text
stage = post_interaction_survey
speaker = system
message = Post-Interaction Questions page displayed.
```

Also record the validation message if the participant attempts to proceed without completing all required items:

```text
stage = post_interaction_survey
speaker = system
message = Please answer all questions before continuing.
```

Do not record the variable names as visible messages to the participant unless they are actually shown on screen. Variable names should be internal only.

## User Interface Requirements

The survey page should be clean, readable, and similar to a standard Qualtrics survey.

Recommended design:

- White or light background.
- Clear section headings.
- Matrix table with visible row separation.
- Radio buttons centered under each Likert option.
- Consistent spacing between sections.
- Sticky or clearly visible Submit button at the bottom.
- Avoid excessive colors.
- Avoid decorative elements.
- Keep the design professional and simple.

## Mobile Responsiveness

If the screen is too narrow for a full matrix table:

- Display each item as a separate block.
- Show the 1-5 response options underneath the item.
- Keep the scale labels visible.
- Make sure the participant can select one response per item.

## Important Rules

- Do not allow submission with missing responses.
- Do not reveal the experimental purpose.
- Do not reveal the assigned condition.
- Do not reveal that any character is AI-generated.
- Do not display variable names to participants.
- Record responses as numbers from 1 to 5.
- Save survey responses on the server.
- Do not store survey responses only in browser localStorage.
- Make sure survey responses are included in downloadable data.
- If an admin download page exists, include `survey_responses.csv` and the updated `experiment_data.xlsx`.

## Prompt to Codex

Use this prompt after adding this file:

```text
I added a new file called 06_post_interaction_survey.md.

Please reread AGENTS.md, 05_data_recording.md, and 06_post_interaction_survey.md.

Then add a post-interaction survey page after the second manager interaction ends, or after the participant chooses not to enter the second manager interaction.

The survey should look like a Qualtrics-style 1-5 Likert matrix.

Use the exact sections and items in 06_post_interaction_survey.md.

All items must be required.

Do not show internal variable names such as VF1, VQ1, MR1, or PR1 to participants.

Record all responses as numeric values from 1 to 5.

Save the responses with:
- PROLIFIC_PID
- STUDY_ID
- SESSION_ID
- assigned_condition
- condition_source
- survey_start_time
- survey_submit_time
- survey_completion_status

Create or update survey_responses.csv.

If experiment_data.xlsx is generated, add a third sheet called survey_responses.

Also update participants.csv with survey completion status.

After the survey, show the three AI-check pages and update participants.csv with:
- completed_ai_check
- ai_check_stage
- ai_check_unusual_start_time, ai_check_unusual_submit_time, ai_check_unusual_text
- ai_check_who_start_time, ai_check_who_submit_time, ai_check_who_text
- ai_check_start_time and ai_check_submit_time, which keep their pilot meaning of when the direct item was shown and submitted
- manager_ai_suspicion, unchanged in name and values
- lisa_ai_suspicion
- john_ai_suspicion

Make sure the survey data are included in the password-protected admin download route.
```
