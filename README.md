# Academic Helpdesk Agent

An academic support chatbot with a web interface, a FastAPI backend, and a
multi-agent assistant powered locally by Ollama. A separate ingestion script
indexes academic PDFs, Markdown files, and CSVs in a persistent Chroma database.

> **Project status:** The chat UI, API, agent hierarchy, Chroma retrieval, and
> a local human-review queue are implemented. Configure an admin token before
> using the review console.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Getting started](#getting-started)
- [GitHub Codespaces](#github-codespaces)
- [Docker Compose and Google Cloud](#docker-compose-and-google-cloud)
- [Running document ingestion](#running-document-ingestion)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Current limitations](#current-limitations)
- [Roadmap](#roadmap)
- [RAG implementation guide](#rag-implementation-guide)

## Features

### Chat application

- Next.js chat interface with a dark theme, responsive sidebar, animated
  transitions, and a Lottie assistant animation.
- Suggested prompts for academic regulations, course information, and email
  drafting.
- Message composer with Enter-to-send and Shift+Enter for a new line.
- FastAPI `POST /chat` endpoint with input validation and explicit error
  responses.
- FastAPI `POST /chat/stream` endpoint streams answer text and safe progress
  statuses to the web UI using Server-Sent Events.
- Local-development CORS access for the frontend at `localhost:3000` and
  `127.0.0.1:3000`.
- ADK conversation history is saved in a local SQLite database and reused for
  follow-up turns in the same browser tab.
- Retrieval queries with no supporting evidence, and conflicts explicitly
  identified by an agent, are deduplicated into a persistent SQLite review
  queue. Admins can claim/answer tickets at `/admin`; reviewed answers can be
  explicitly published to `data/FAQ.md`.
- The admin console uses REST for durable state and a WebSocket for live
  notifications. Ticket status is also available to students by ticket ID.

### Agent workflow

- An orchestrator agent routes relevant requests to specialized agents:
  - **Policy agent** — academic policies, procedures, and regulations.
  - **Schedule agent** — course planning, schedules, and time management.
  - **Email agent** — drafting, editing, and responding to academic emails.
- General in-scope academic questions can be handled by the orchestrator.
- Agent models are configured through LiteLLM and use the local
  `gemma4:e4b` model served by Ollama.

### Academic document indexing

- Recursively scans the `data/` directory for `.pdf`, `.md`, and `.csv` files.
- Extracts PDF text page-by-page with `pypdf`, reads Markdown as UTF-8, and
  converts CSV rows into labeled field/value text.
- Splits extracted text into overlapping word chunks and stores each chunk with
  source and location metadata in a persistent Chroma collection specific to
  the configured Ollama embedding model.
- Uses stable SHA-256 IDs and Chroma `upsert`, so re-running ingestion updates
  existing chunk IDs rather than inserting duplicate IDs. It also removes
  stale chunks for successfully processed, changed, or deleted source files.

## Technology stack

| Area | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| UI | Tailwind CSS 4, Framer Motion, Lucide React, Lottie |
| API | Python, FastAPI, Pydantic, Uvicorn |
| Agent framework | Google Agent Development Kit (ADK) |
| Model routing | LiteLLM |
| Local model runtime | Ollama (`gemma4:e4b`) |
| Document processing | pypdf, Python `csv` module |
| Vector storage | ChromaDB with persistent local storage |

Python package versions are pinned in [`requirements.txt`](./requirements.txt);
frontend dependencies and scripts are defined in
[`frontend/package.json`](./frontend/package.json).

## Architecture

```text
Browser
  └── Next.js frontend
        └── POST /chat ──> FastAPI server
                              └── ADK orchestrator
                                    ├── Policy agent
                                    ├── Schedule agent
                                    └── Email agent
                                          └── LiteLLM ──> Ollama model

data/ ──> scripts/ingest_pdfs.py ──> ChromaDB (chroma_db/)
                                      └── agents/retrieval.py
                                            └── unanswered ──> SQLite review queue
                                                                  ├── REST admin API
                                                                  └── WebSocket notifications
```

The frontend keeps the active `session_id` in tab-scoped `sessionStorage` and
sends it with every turn. ADK stores the associated conversation events in
`.local/agent_sessions.db`, so history survives API process restarts. The
**New conversation** button creates a fresh session. The transcript UI itself
does not restore prior messages after a page refresh, even though the model can
still use the stored session context.

This is conversation history, not permanent learned memory: the model does not
learn facts from one session for use in unrelated sessions. Session data has no
automatic expiry or deletion UI. The local prototype also has no
authentication, so it should not be exposed publicly with sensitive
conversations without access controls and a data-retention policy.

Review tickets are stored separately in `.local/review_tickets.db`, not in
Chroma. The admin API is disabled until `ADMIN_API_TOKEN` is configured. This
prototype uses one shared bearer token; use proper per-admin authentication
and authorization before deployment. Review questions can contain personal
information, so define access and retention policies before collecting real
student data.

## Requirements

- Python with support for the pinned packages in `requirements.txt`.
- Node.js and npm.
- [Ollama](https://ollama.com/) installed and running locally.
- An admin token for the review console (optional for chat, required for admin
  endpoints).
- The configured Ollama model pulled locally:

  ```bash
  ollama pull gemma4:e4b
  ```

The Python agent uses `http://localhost:11434` for Ollama. Its model and endpoint
are set in [`agents/model_config.py`](./agents/model_config.py).

## Getting started

### 1. Install Python dependencies

From the repository root:

```bash
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If you already created the project virtual environment, activate it and install
or update packages with the last command.

### 2. Start Ollama

Make sure the Ollama service is running and `gemma4:e4b` is available. If Ollama
is not already running as a service, start it in a separate terminal:

```bash
ollama serve
```

### 3. Start the API server

From the repository root:

```bash
./venv/bin/python server.py
```

The API listens at `http://127.0.0.1:8000`. Interactive Swagger docs are
available at [`http://127.0.0.1:8000/docs`](http://127.0.0.1:8000/docs).

### 4. Configure and start the frontend

Create `frontend/.env.local` with the API endpoint:

```dotenv
NEXT_PUBLIC_CHAT_API_URL=http://127.0.0.1:8000/chat
```

Then run the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open [`http://localhost:3000`](http://localhost:3000). Restart the Next.js
development server after changing the environment file. Keep machine-specific
settings out of commits. Values prefixed with `NEXT_PUBLIC_` are exposed to
browser-side code and must not contain secrets.

## GitHub Codespaces

The [`.devcontainer/`](./.devcontainer/) configuration installs Docker-in-Docker,
starts the Compose stack when the Codespace is created, and forwards port 80.
Open the forwarded **Academic Helpdesk** port in the Ports tab. Select a
Codespace with enough memory and disk for Ollama; model inference speed and
availability depend on the Codespaces machine size. Ollama runs CPU-only here,
so chat responses can take several minutes on smaller machines.

The model files are not downloaded automatically. In the Codespace terminal:

```bash
docker compose exec ollama ollama pull gemma4:e4b
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec api python scripts/ingest_pdfs.py
```

Set a long random `ADMIN_API_TOKEN` in `.env` to enable the review console. Set
`ALLOWED_ORIGINS` there to include the exact HTTPS URL shown for port 80 in the
Ports tab (for example, `https://YOUR-CODESPACE-80.app.github.dev`) so the
admin WebSocket accepts the forwarded origin. Then restart the API:

```bash
docker compose up -d --force-recreate api
```

The startup script adds the forwarded origin automatically when Codespaces
provides its name and forwarding-domain environment variables. Codespaces may
stop when idle; named Docker volumes preserve data while the Codespace exists,
but this is not a production hosting substitute.

## Docker Compose and Google Cloud

The root [`docker-compose.yml`](./docker-compose.yml) runs the Next.js frontend,
FastAPI backend, Ollama, and a Caddy reverse proxy. Caddy serves the site on
port 80 (and HTTPS on 443 when configured with a domain) and routes `/api/` to
the backend. Only the proxy publishes ports; Ollama and the API stay on the
private Compose network. Named volumes preserve Ollama models, the Chroma
index, conversation history, and review tickets across container restarts.

### Run with Docker Compose

Install Docker Engine and the Docker Compose plugin, then from the repository
root:

```bash
cp .env.example .env
```

Set a long random `ADMIN_API_TOKEN` in `.env` if you will use `/admin`, then
build and start the services:

```bash
docker compose up --build -d
docker compose exec ollama ollama pull gemma4:e4b
docker compose exec ollama ollama pull nomic-embed-text
docker compose exec api python scripts/ingest_pdfs.py
```

Open `http://localhost`. Ollama must have both models pulled before chat and
document ingestion will work. To stop the services without deleting their
persistent data, run `docker compose down`. Do not run `docker compose down -v`
unless you intend to delete the stored models, index, and application databases.

### Deploy on Google Cloud Compute Engine

This Compose deployment is intended for a Compute Engine VM. A reasonable
starting size is an `e2-standard-8` VM with a 100 GB balanced persistent boot
disk; Ollama inference speed depends on the selected VM and model.

1. In `gcloud`, select your project and choose a region/zone. Reserve a static
   external IP, create a firewall rule for web traffic, and create an Ubuntu
   VM with that IP and matching network tag:

   ```bash
   gcloud config set project YOUR_PROJECT_ID
   gcloud compute addresses create academic-helpdesk-ip --region=YOUR_REGION
   gcloud compute firewall-rules create academic-helpdesk-web \
     --direction=INGRESS --action=ALLOW --rules=tcp:80,tcp:443 \
     --source-ranges=0.0.0.0/0 --target-tags=academic-helpdesk-web
   gcloud compute instances create academic-helpdesk \
     --zone=YOUR_ZONE --machine-type=e2-standard-8 \
     --boot-disk-size=100GB --boot-disk-type=pd-balanced \
     --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
     --address=academic-helpdesk-ip --tags=academic-helpdesk-web
   ```

   Get the address to use in the next step:

   ```bash
   gcloud compute addresses describe academic-helpdesk-ip \
     --region=YOUR_REGION --format='get(address)'
   ```

   The address region must match the instance zone's region. Keep SSH access
   restricted to your administrators; do not expose ports 8000 or 11434.

2. Connect to the VM and install Docker Engine with its Compose plugin, using
   Docker's [Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/).
   Then clone the repository:

   ```bash
   gcloud compute ssh academic-helpdesk --zone=YOUR_ZONE
   git clone https://github.com/sanskarppatil/Academic_Helpdesk_Agent.git
   cd Academic_Helpdesk_Agent
   cp .env.example .env
   nano .env
   ```

3. Edit `.env` on the VM. For initial testing by external IP, use:

   ```dotenv
   SITE_ADDRESS=:80
   ALLOWED_ORIGINS=http://YOUR_STATIC_EXTERNAL_IP
   ADMIN_API_TOKEN=PASTE_A_LONG_RANDOM_SECRET_HERE
   ```

   Generate the admin token with `openssl rand -hex 32`. For a public
   deployment, point a DNS A record at the VM IP, then use the domain name
   instead: set `SITE_ADDRESS=helpdesk.example.org` and
   `ALLOWED_ORIGINS=https://helpdesk.example.org`. Caddy will obtain and renew
   the HTTPS certificate automatically when DNS points to the VM and ports 80
   and 443 are reachable. Do not use the admin console over plain HTTP with a
   real token.

4. Build and start the stack, download the required Ollama models, and index
   the bundled academic documents:

   ```bash
   sudo docker compose up --build -d
   sudo docker compose exec ollama ollama pull gemma4:e4b
   sudo docker compose exec ollama ollama pull nomic-embed-text
   sudo docker compose exec api python scripts/ingest_pdfs.py
   sudo docker compose ps
   ```

   Open `http://YOUR_STATIC_EXTERNAL_IP` for the IP-based setup or
   `https://helpdesk.example.org` for the domain setup. Visit `/admin` and
   enter the `ADMIN_API_TOKEN` value to use the review console. The VM's
   persistent disk and Docker volumes retain models, indexed documents, and
   SQLite databases; back up or snapshot the disk regularly.

## Running document ingestion

Place supported academic source files anywhere under `data/`. The repository
already organizes examples under folders such as `data/policies/`,
`data/course_details/`, `data/curriculum/`, `data/faculty/`, and
`data/timetable/`.

Run the ingestion script from the repository root:

```bash
./venv/bin/python scripts/ingest_pdfs.py
```

The script recursively scans `data/` and indexes:

- **PDF:** text is extracted for each page. Scanned image-only pages need OCR
  and will not produce searchable text through the current parser.
- **Markdown:** UTF-8 text is chunked directly.
- **CSV:** each row is represented as `column: value` lines, preserving the
  relationship between headers and values.

Chunks are stored in the `academic_documents_nomic_embed_text` collection under
`chroma_db/`.
Metadata includes the relative source path, file type, chunk number, and
page/row location where applicable. Embeddings are generated by Ollama using
the model configured in `scripts/rag.py`. After ingestion while the API is
running, open `/admin` and choose **Reload retrieval cache**, or restart the
API, so retrieval loads the updated collection.

Ingestion is a separate command-line step. The schedule and policy agents query
the collection through `agents/retrieval.py`. Retrieval evidence is not a
guarantee against model errors; answers should still be checked against their
cited sources.

### Human review setup

Configure the backend token before starting FastAPI:

```bash
export ADMIN_API_TOKEN="replace-with-a-long-random-secret"
./venv/bin/python server.py
```

In another terminal, start the frontend (`cd frontend && npm run dev`), then
open `http://localhost:3000/admin` and enter the same token. Keep the token out
of source control and use a unique secret. If `ADMIN_API_TOKEN` is unset, admin
REST and WebSocket endpoints return disabled/close connections.

When retrieval finds no sufficiently relevant evidence, it creates or updates
an `open` review ticket in `.local/review_tickets.db` and returns the ticket ID
to the agent. Admins can claim and answer tickets. FAQ publication is a separate
explicit admin action; it appends a reviewed entry to `data/FAQ.md`, which is
picked up by the next ingestion run. Publishing also invalidates the current
process's retrieval cache. The frontend shows the referral ID to students when
the agent follows the referral instruction; ticket status and resolution are
available from `GET /tickets/{ticket_id}`.

## API reference

### `POST /chat`

Request JSON:

```json
{
  "message": "What are the attendance requirements?",
  "user_id": "student-123",
  "session_id": "optional-existing-session-id"
}
```

Only `message` is required. It must contain non-whitespace text and be no longer
than 4,000 characters. If `session_id` is omitted, the API creates one.

Example:

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Draft an email asking my professor for a sick day."}'
```

Successful response:

```json
{
  "response": "Subject: Request for Sick Leave ...",
  "user_id": "default_user",
  "session_id": "returned-session-id"
}
```

Invalid input receives a validation error. Agent/model processing failures are
returned as HTTP 502 responses.

### `POST /chat/stream`

Accepts the same JSON body as `/chat`, and returns a Server-Sent Events stream
with `status`, `delta`, `done`, and `error` events. The frontend displays answer
text as it arrives and shows safe progress updates such as document search.
Private model reasoning is not sent to clients.

### Admin review endpoints

All `/admin/*` HTTP endpoints require `Authorization: Bearer <ADMIN_API_TOKEN>`.

- `GET /admin/tickets?status=open` — list tickets (`open`, `claimed`,
  `answered`, or `closed`).
- `POST /admin/tickets/{ticket_id}/claim` — claim an open ticket.
- `POST /admin/tickets/{ticket_id}/close` — close an open or claimed ticket
  without providing an answer.
- `POST /admin/tickets/{ticket_id}/resolve` — resolve a ticket:

  ```json
  { "answer": "Reviewed answer text" }
  ```

- `POST /admin/tickets/{ticket_id}/publish` — publish a saved answer to
  `data/FAQ.md`.
- `POST /admin/retriever/refresh` — clear cached documents after external
  ingestion.
- `GET /tickets/{ticket_id}` — retrieve the ticket status and any answer using
  the unguessable ticket ID.
- `WS /admin/ws` — after connecting, send
  `{"token":"...","after_sequence":0}` to authenticate and receive live ticket
  notifications. REST remains the source of truth; clients should reload the
  ticket list after connecting or reconnecting.

## Project structure

```text
.
├── agents/
│   ├── academic_agent.py   # Orchestrator, ADK runner, and run_agent()
│   ├── email_agent.py      # Email specialist
│   ├── model_config.py     # Shared Ollama/LiteLLM configuration
│   ├── policy_agent.py     # Policy specialist
│   ├── review_tickets.py   # Persistent human-review queue
│   ├── retrieval.py        # Chroma hybrid retriever and abstention
│   └── schedule_agent.py   # Scheduling specialist
├── .local/                 # Git-ignored ADK history and review-ticket databases
├── data/                   # Source PDFs, Markdown, and CSV files
├── frontend/
│   ├── app/                # Next.js UI and styles
│   └── public/             # Static assets and animation
├── scripts/
│   └── ingest_pdfs.py      # Document parsing and Chroma ingestion
├── chroma_db/              # Persistent Chroma database
├── requirements.txt        # Pinned Python dependencies
└── server.py               # FastAPI application
```

## Current limitations

- The transcript display is not restored after a page refresh, though ADK
  retains the session context while the tab's session ID is available.
- Stored conversation sessions do not yet have automatic expiry, deletion
  controls, or authenticated per-user access.
- The PDF parser extracts embedded text only; scanned documents need OCR.
- CORS is configured for local development origins. A deployed frontend needs
  its origin configured explicitly.
- Admin review currently uses one shared bearer token, not individual admin
  accounts, roles, or a full audit identity.
- Automatic escalation covers retrieval abstentions and conflicts identified
  by an agent; it does not detect every unsupported statement the model might
  produce when it uses no retrieval.
- Explicit "cannot verify / unavailable" responses from the schedule and policy
  specialists are converted to durable review tickets by the agent runner as a
  fallback if the model neglects to call the review tool.
- Ticket data currently has no automatic retention or deletion controls.
- Rate limiting and production deployment configuration are not implemented.

## Roadmap

These are planned areas of work, not features currently delivered:

- [x] Connect Chroma similarity search to the agent workflow.
- [x] Add source citations and a human-review queue for retrieval abstentions.
- [ ] Restore and display prior messages when resuming an existing session.
- [ ] Add session deletion/retention controls and authenticated user identity.
- [ ] Add OCR support for scanned PDFs and improve parsing of complex tables.
- [x] Remove stale chunks after source changes and deleted files.
- [x] Add automated tests for ticket persistence and admin API behavior.
- [ ] Add production configuration for secrets, CORS origins, logging,
  monitoring, authentication, and deployment.

## License

See [`LICENSE`](./LICENSE).

## RAG implementation guide

For a step-by-step plan to connect Chroma retrieval to ADK agent tools, see the
[RAG implementation guide](./docs/RAG_IMPLEMENTATION_GUIDE.md). It documents
the current collection and metadata, proposes a retriever function, explains
how to expose it to the relevant agents, and includes a testing checklist.
