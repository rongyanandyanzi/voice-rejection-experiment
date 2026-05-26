# Deployment Notes

This experiment must run as a Node web service, not as a static-only site, because participant data is posted to `/api/participant` and `/api/interaction`.

Do not use `file://` or `localhost` for participant links. The deployed URL must be the public Render URL.

## Files Prepared for Deployment

- `server.js`: Node server that serves the experiment and records data.
- `package.json`: declares `npm start`.
- `render.yaml`: Render blueprint for a web service with a persistent disk.
- `.gitignore`: excludes generated data files.

## Required Persistent Storage

Set `DATA_DIR` to a persistent disk or volume path. The server writes:

- `participants.csv`
- `interactions.csv`
- `survey_responses.csv`
- `experiment_data.csv`
- `experiment_data.xlsx`

Do not deploy on a platform/filesystem where server files disappear on restart unless you attach a persistent volume.

## Environment Variables

- `PORT`: supplied by the host.
- `DATA_DIR`: persistent directory for data files, for example `/var/data`.
- `ADMIN_TOKEN`: optional secret for protected data downloads.
- `OPENAI_API_KEY`: required for AI-generated Manager, Lisa, and John chat replies.
- `OPENAI_MODEL`: optional model name. Defaults to `gpt-5.5`.
- `OPENAI_REASONING_EFFORT`: optional reasoning level for GPT-5-class models. Defaults to `low`. Use `medium` or `high` only if you want stronger but slower and more expensive replies.

The OpenAI API key must be set on the server or in Render environment variables. Do not put the API key in `app.js`, `index.html`, GitHub, Prolific, or any browser-visible file.

## Render Blueprint

`render.yaml` defines a Node web service with a persistent disk mounted at `/var/data`.

The Render service should use:

- Runtime: `Node`
- Build command: blank, or `npm install`
- Start command: `npm start`
- Persistent disk mount path: `/var/data`
- Environment variable `DATA_DIR=/var/data`
- Environment variable `ADMIN_TOKEN=<a long private random string>`
- Environment variable `OPENAI_API_KEY=<your OpenAI API key>`
- Optional environment variable `OPENAI_MODEL=gpt-5.5`
- Optional environment variable `OPENAI_REASONING_EFFORT=low`

After deployment, use the public service URL as the experiment URL:

```text
https://YOUR-SERVICE.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=HP_HC
```

If `condition` is omitted or invalid, the app randomly assigns one of:

- `HP_HC`
- `HP_LC`
- `LP_HC`
- `LP_LC`

## Data Access

Participants cannot directly access the generated data files.

If `ADMIN_TOKEN` is set, authorized downloads are available at:

```text
https://YOUR-SERVICE.onrender.com/admin/download/participants.csv?token=YOUR_ADMIN_TOKEN
https://YOUR-SERVICE.onrender.com/admin/download/interactions.csv?token=YOUR_ADMIN_TOKEN
https://YOUR-SERVICE.onrender.com/admin/download/survey_responses.csv?token=YOUR_ADMIN_TOKEN
https://YOUR-SERVICE.onrender.com/admin/download/experiment_data.csv?token=YOUR_ADMIN_TOKEN
https://YOUR-SERVICE.onrender.com/admin/download/experiment_data.xlsx?token=YOUR_ADMIN_TOKEN
```

Keep the admin token private. Do not put admin download URLs in Prolific or send them to participants.

## Create the GitHub Repository

1. Go to GitHub and create a new repository.
2. Recommended name: `voice-rejection-experiment`.
3. Choose either private or public. Private is recommended for research materials.
4. Do not initialize with README, `.gitignore`, or license, because this local folder already has project files.

## Push This Folder to GitHub

Run these commands from the project folder:

```bash
cd "/Users/rongyan/Documents/Codex/voice rejection"
git status --short
git add AGENTS.md *.md index.html styles.css app.js server.js package.json render.yaml .gitignore
git commit -m "Prepare experiment for online deployment"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/voice-rejection-experiment.git
git push -u origin main
```

If Git says `remote origin already exists`, use:

```bash
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/voice-rejection-experiment.git
git push -u origin main
```

Confirm that these files are not pushed:

- `participants.csv`
- `interactions.csv`
- `survey_responses.csv`
- `experiment_data.csv`
- `experiment_data.xlsx`
- `data/`

## Connect GitHub to Render

Option A: use the blueprint.

1. In Render, click **New +**.
2. Choose **Blueprint**.
3. Connect your GitHub account if Render asks.
4. Select the `voice-rejection-experiment` repository.
5. Render should read `render.yaml`.
6. Create/apply the blueprint.
7. Wait for the service to deploy.

Option B: create the web service manually.

1. In Render, click **New +**.
2. Choose **Web Service**.
3. Connect the `voice-rejection-experiment` GitHub repository.
4. Runtime: **Node**.
5. Branch: `main`.
6. Build command: leave blank or use `npm install`.
7. Start command: `npm start`.
8. Add a persistent disk:
   - Name: `experiment-data`
   - Mount path: `/var/data`
   - Size: `1 GB`
9. Add environment variables:
   - `NODE_ENV=production`
   - `DATA_DIR=/var/data`
   - `ADMIN_TOKEN=<a long private random string>`
   - `OPENAI_API_KEY=<your OpenAI API key>`
   - `OPENAI_MODEL=gpt-5.5`
   - `OPENAI_REASONING_EFFORT=low`
10. Click **Create Web Service**.

## Test the Deployed Experiment

After Render gives you a URL like:

```text
https://voice-rejection-experiment.onrender.com
```

Open this test URL:

```text
https://voice-rejection-experiment.onrender.com/?PROLIFIC_PID=test_pid&STUDY_ID=test_study&SESSION_ID=test_session&condition=HP_HC
```

Go through a few chat messages. Then check data download:

```text
https://voice-rejection-experiment.onrender.com/admin/download/participants.csv?token=YOUR_ADMIN_TOKEN
https://voice-rejection-experiment.onrender.com/admin/download/interactions.csv?token=YOUR_ADMIN_TOKEN
https://voice-rejection-experiment.onrender.com/admin/download/survey_responses.csv?token=YOUR_ADMIN_TOKEN
https://voice-rejection-experiment.onrender.com/admin/download/experiment_data.csv?token=YOUR_ADMIN_TOKEN
https://voice-rejection-experiment.onrender.com/admin/download/experiment_data.xlsx?token=YOUR_ADMIN_TOKEN
```

Also verify that direct public access is blocked:

```text
https://voice-rejection-experiment.onrender.com/participants.csv
```

It should return `403 Forbidden`.

## Prolific URL

Use this URL format in Prolific:

```text
https://voice-rejection-experiment.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}
```

To force a condition, add one of `HP_HC`, `HP_LC`, `LP_HC`, or `LP_LC`:

```text
https://voice-rejection-experiment.onrender.com/?PROLIFIC_PID={{%PROLIFIC_PID%}}&STUDY_ID={{%STUDY_ID%}}&SESSION_ID={{%SESSION_ID%}}&condition=HP_HC
```

If you do not include `condition`, the experiment randomly assigns one and keeps it fixed for that participant session.
