# Post-Interaction Survey Requirements

## Purpose

After the second manager interaction ends, the participant should complete a post-interaction survey.

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

Do not reveal that Lisa, John, or the manager are AI-generated.

## Placement in Experiment Flow

This survey page should appear after the second manager interaction ends.

The second manager interaction refers to the neutral manager follow-up interaction after Alex chooses to bring the new issue up with the manager.

The sequence should be:

1. Alex completes the first manager interaction about the flexible labor proposal.
2. Alex moves to the transition page.
3. Alex enters the Lisa and John interaction about the new issue.
4. Alex decides whether to bring the new issue up with the manager.
5. If Alex chooses yes, Alex enters the second manager interaction.
6. After the second manager interaction ends, the post-interaction survey page appears.
7. If Alex chooses no, the system should skip the second manager interaction and go directly to the post-interaction survey page.
8. Alex completes all survey items.
9. Alex proceeds to the AI-check page.
10. Alex answers whether the manager, Lisa, and John may have been AI.
11. Alex proceeds to the completion page.

The survey must be completed by all participants who reach the end of the Lisa and John interaction.

The survey should not depend on whether Alex chose to speak with the manager again.

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

The survey should be presented in a Qualtrics-style matrix format.

For each section:

- Display the section title.
- Display the instruction or stem.
- Display each item as one row.
- Display response options 1 to 5 as columns.
- Use radio buttons for responses.
- Each row should allow only one response.
- Every item should be required.
- The participant should not be able to submit or continue until all items are answered.

Recommended column labels:

| Item | 1 Strongly disagree | 2 Disagree | 3 Neither agree nor disagree | 4 Agree | 5 Strongly agree |

For small screens, the layout should remain readable. If needed, use a mobile-friendly layout where each item is shown with five radio options underneath.

## Section 1: Future Communication Intentions

### Section Title

Future Communication Intentions

### Instruction

Before receiving the manager's feedback, please indicate your next steps and how you intend to proceed with your proposal.

### Items

#### VF1

I will take the initiative multiple times to propose specific improvements for attracting more visitors during off-season weekdays.

#### VF2

I will make a point to suggest new ways to attract nearby university students.

#### VF3

Even if the manager seems dismissive, I will persist in communicating my alternative views on how the park can improve off-season weekday attendance.

#### VF4

I will take every opportunity during the session to share proactive ideas on expanding the park's visitor base beyond families with young children.

#### VF5

I will be a lead contributor throughout the discussion regarding how to attract nearby university students and make better use of the park's surrounding environment.

#### VF6

I will repeatedly offer my own constructive suggestions and ideas to improve the park's visitor strategy during off-season weekdays.

## Section 2: Proposal Preparation Intentions

### Section Title

Proposal Preparation Intentions

### Instruction

Before receiving the manager's feedback, please indicate how you intend to improve the quality of your proposal.

### Items

#### VQ1

When presenting my suggestion, I will strive to showcase a well-researched proposal backed by entrance records, visitor comments, and location information.

#### VQ2

When offering my opinions, I will make every effort to address the manager's specific concerns regarding visitor demand, feasibility, and park operations.

#### VQ3

When proposing ways to attract nearby university students, I will attempt to clarify any doubts the manager might have about whether this visitor group is suitable for the park.

#### VQ4

When pointing out the limitations of relying mainly on families with young children, I will prepare a clear, actionable solution for the manager.

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
MA1. Polite.
MA2. Respectful.
MA3. Sensitive to my feelings.
MA4. Respectful toward me.
MA5. Justified.
MA6. Courteous.
MA7. Considerate toward me.
MA8. Tactful.

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

### MC1

Focused on identifiable problems and behaviors upon which I can take action.

### MC2

Suggested that my weaknesses can be overcome or remedied.

### MC3

Made reference to clear, legitimate standards for acceptable behavior.

### MC4

Was very specific and detailed.

### MC5

Made reference to specific situations or incidents that were problematic.

### MC6

Provided clear enough guidance that I knew what to change.



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

## AI-Check Page After Survey

After the Post-Interaction Questions page is submitted, show one additional page before the completion page.

Display the following text:

```text
In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the questions below.
```

Then ask the following three required questions:

```text
Do you think the manager you interacted with may have been AI?

Do you think Lisa may have been AI?

Do you think John may have been AI?
```

For each question, use required radio-button response options:

- Yes
- No
- Not sure

Do not allow the participant to continue without answering.

After the participant submits all three questions, move the participant to the completion page.

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

Voice quality improvement effort items.

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

Then add a post-interaction survey page after the second manager interaction ends.

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

After the survey, show the AI-check page and update participants.csv with:
- completed_ai_check
- ai_check_start_time
- ai_check_submit_time
- manager_ai_suspicion
- lisa_ai_suspicion
- john_ai_suspicion

Make sure the survey data are included in the password-protected admin download route.
```
