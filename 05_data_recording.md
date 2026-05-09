# Data Recording Requirements

## Purpose

The experiment must record each participant's Prolific information, assigned experimental condition, participant-level progress, and all interaction data.

The data should be saved in an Excel-compatible format.

Preferred output files:

- `participants.csv`
- `interactions.csv`

If possible, also generate:

- `experiment_data.xlsx`

The Excel file should contain two sheets:

1. `participants`
2. `interactions`

## Prolific ID Recording

When the participant enters the experiment, the system should read the following URL parameters:

- `PROLIFIC_PID`
- `STUDY_ID`
- `SESSION_ID`

These values should be stored immediately when the participant starts the experiment.

If any value is missing, store an empty value or `"missing"`, but do not stop the experiment.

Example Prolific study URL:

```text
https://your-experiment-url.com?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

If the condition is assigned through the URL, use:

```text
https://your-experiment-url.com?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=HP_HC
```

## Experimental Condition Recording

The system must record the assigned experimental condition for each participant.

The assigned condition should be created or retrieved when the participant starts the experiment.

The condition must be stored at both the participant level and the message level.

Use one of the following condition labels:

- `HP_HC` = High Politeness + High Constructiveness
- `HP_LC` = High Politeness + Low Constructiveness
- `LP_HC` = Low Politeness + High Constructiveness
- `LP_LC` = Low Politeness + Low Constructiveness

## Condition Assignment Rules

If the experiment URL includes a `condition` parameter, read the condition from the URL.

Example:

```text
?condition=HP_HC
```

If no condition is provided in the URL, the system should randomly assign one of the four conditions:

- `HP_HC`
- `HP_LC`
- `LP_HC`
- `LP_LC`

Once a condition is assigned, it must remain fixed for the whole participant session.

The condition must not change after page refresh.

The condition must be saved together with the participant's Prolific ID.

The condition must not be shown to the participant.

The assigned condition determines which manager rejection script is used in the first manager interaction.

## Condition Source

The system should record how the condition was assigned.

Use the column:

- `condition_source`

Possible values:

- `url`
- `random_assignment`

If the condition comes from the URL parameter, record:

```text
condition_source = url
```

If the condition is randomly assigned by the experiment system, record:

```text
condition_source = random_assignment
```

## Participant-Level Data to Record

The system should record one row per participant in `participants.csv`.

The participant-level data should include:

- Prolific ID information
- Assigned experimental condition
- Condition source
- Experiment start and end time
- Completion status
- Whether each major stage was completed
- Alex's decision about whether to bring the new proposal up with the manager

## participants.csv Columns

Use the following columns:

- `prolific_pid`
- `study_id`
- `session_id`
- `assigned_condition`
- `condition_source`
- `experiment_start_time`
- `experiment_end_time`
- `completed_initial_manager_interaction`
- `completed_transition_page`
- `completed_lisa_john_interaction`
- `chose_to_bring_this_up_with_manager`
- `completed_neutral_manager_followup`
- `completion_status`

## Participant-Level Variable Definitions

### prolific_pid

The participant's Prolific ID from the URL parameter `PROLIFIC_PID`.

If missing, record `"missing"`.

### study_id

The Prolific study ID from the URL parameter `STUDY_ID`.

If missing, record `"missing"`.

### session_id

The Prolific session ID from the URL parameter `SESSION_ID`.

If missing, record `"missing"`.

### assigned_condition

The assigned experimental condition.

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

### experiment_start_time

The timestamp when the participant starts the experiment.

### experiment_end_time

The timestamp when the participant completes or exits the experiment.

If the participant does not complete the experiment, record the latest available timestamp.

### completed_initial_manager_interaction

Record whether the participant completed the first manager interaction.

Allowed values:

- `true`
- `false`

### completed_transition_page

Record whether the participant reached the transition page after the first manager interaction.

Allowed values:

- `true`
- `false`

### completed_lisa_john_interaction

Record whether the participant completed the Lisa and John interaction.

Allowed values:

- `true`
- `false`

### chose_to_bring_this_up_with_manager

Record Alex's decision after the Lisa and John interaction.

This is the answer to the question:

```text
Do you want to bring this up with the manager now?
```

Allowed values:

- `yes`
- `no`
- `unclear`
- `not_reached`

### completed_neutral_manager_followup

Record whether the participant completed the neutral manager follow-up interaction.

Allowed values:

- `true`
- `false`

### completion_status

Record the participant's overall completion status.

Allowed values:

- `completed`
- `partial`
- `dropped_out`

## Interaction-Level Data to Record

The system should record every message shown to or typed by Alex.

Each message should be one row in `interactions.csv`.

The system should record:

- every message typed by Alex
- every message sent by the manager
- every message sent by Lisa
- every message sent by John
- system messages shown to Alex, such as transition text and completion messages
- decision prompts
- Alex's answer to the decision prompt

Do not overwrite previous messages.

Do not store only the final transcript.

Record messages continuously during the experiment.

If the participant closes the page early, partial data should still be saved.

## interactions.csv Columns

Use the following columns:

- `prolific_pid`
- `study_id`
- `session_id`
- `assigned_condition`
- `stage`
- `speaker`
- `message`
- `timestamp`
- `response_order`
- `participant_decision`

## Interaction-Level Variable Definitions

### prolific_pid

The participant's Prolific ID.

### study_id

The Prolific study ID.

### session_id

The Prolific session ID.

### assigned_condition

The participant's assigned experimental condition.

This value should be included in every message row.

Allowed values:

- `HP_HC`
- `HP_LC`
- `LP_HC`
- `LP_LC`

### stage

The current stage of the experiment.

Use the following stage names:

1. `initial_manager_interaction`
2. `transition_page`
3. `lisa_john_interaction`
4. `decision_prompt`
5. `neutral_manager_followup`
6. `completion_page`

### speaker

The person or source of the message.

Allowed values:

- `alex`
- `manager`
- `lisa`
- `john`
- `system`

### message

The exact message text shown to or typed by the participant.

Record the message exactly as it appears.

### timestamp

The exact time when the message is sent, received, or displayed.

Use a consistent timestamp format, such as ISO 8601.

Example:

```text
2026-05-09T16:30:25.123+08:00
```

### response_order

The order of the message within the participant's session.

Start from `1` and increase by `1` for each recorded message.

### participant_decision

Use this column mainly for the decision prompt stage.

Allowed values:

- `yes`
- `no`
- `unclear`
- empty value for non-decision messages

## Message Recording Rules

Record every message as soon as possible.

Record each message as a separate row.

Do not overwrite previous rows.

Do not rely only on browser `localStorage`.

Data should be saved to a server-side file, database, or backend endpoint.

If local storage is used temporarily, it should only be used as a backup before syncing to the server.

The system should continue saving partial data even if the participant exits early.

## Stage-Specific Recording Rules

### initial_manager_interaction

Record:

- manager opening message
- Alex's messages
- manager's general follow-up question before rejection
- assigned condition-specific manager rejection
- Alex's message after rejection, if any
- manager closing message
- manager offline/completion message

### transition_page

Record:

- transition text shown to Alex
- timestamp when the transition page is displayed
- timestamp when Alex proceeds to the next page, if available

### lisa_john_interaction

Record:

- Lisa's messages
- John's messages
- Alex's messages
- timing/order of messages
- any delays do not need to be recorded unless technically easy

### decision_prompt

Record the decision prompt:

```text
Do you want to bring this up with the manager now?
```

Record Alex's decision as:

- `yes`
- `no`
- `unclear`

### neutral_manager_followup

This stage only occurs if Alex chooses `yes`.

Record:

- manager opening message
- Alex's proposal
- manager's neutral follow-up questions
- Alex's answers
- neutral ending message

### completion_page

Record:

- completion message
- experiment end time
- final completion status

## Excel Output Requirements

The system should save the data in Excel-compatible format.

Minimum required files:

- `participants.csv`
- `interactions.csv`

If possible, also generate:

- `experiment_data.xlsx`

The Excel file should contain two sheets:

1. `participants`
2. `interactions`

The `participants` sheet should use the same columns as `participants.csv`.

The `interactions` sheet should use the same columns as `interactions.csv`.

## Data Safety and Access Rules

Do not expose the data file to participants.

Do not allow participants to download the data file.

Do not display other participants' data.

Do not reveal the assigned condition to participants.

Do not reveal the experimental purpose to participants.

Do not reveal that Lisa, John, or the manager are AI-generated.

## Implementation Notes for Codex

When implementing this data recording system:

1. Read `PROLIFIC_PID`, `STUDY_ID`, `SESSION_ID`, and optional `condition` from the URL.
2. Validate the condition value if provided.
3. If the condition value is missing or invalid, randomly assign one of the four allowed conditions.
4. Store the assigned condition immediately.
5. Keep the assigned condition fixed throughout the session.
6. Use the assigned condition to select the correct manager rejection script in the first manager interaction.
7. Record one participant-level row.
8. Record one interaction-level row for every message.
9. Save partial data continuously.
10. Export or write data to CSV files.
11. Generate an Excel workbook if technically feasible.

## Prompt to Codex

Use this prompt after adding this file:

```text
I added a new file called 05_data_recording.md.

Please reread AGENTS.md and all experiment markdown files.

Then update the experiment implementation so that it records:

1. PROLIFIC_PID, STUDY_ID, and SESSION_ID from the URL;
2. the assigned experimental condition;
3. whether the condition came from the URL or random assignment;
4. every message from Alex, the manager, Lisa, and John;
5. system messages, transition messages, decision prompts, and completion messages;
6. timestamps and stage names;
7. Alex's decision after the Lisa and John interaction.

Please save the data in Excel-compatible format, preferably participants.csv and interactions.csv. If possible, also generate experiment_data.xlsx with two sheets: participants and interactions.

The assigned condition should be one of:
- HP_HC
- HP_LC
- LP_HC
- LP_LC

If the URL includes a condition parameter, use that value.
If the URL does not include a condition parameter, randomly assign one condition and keep it fixed for the whole participant session.

Record assigned_condition in both participants.csv and interactions.csv.
Record condition_source as either url or random_assignment in participants.csv.

Do not show the condition label to participants.

The assigned condition should determine which manager rejection script is used in the first manager interaction.
```
