# Eromify - AI Influencer Generator SaaS

A powerful SaaS platform that generates AI-powered influencer content and profiles.

## Features

- 🤖 AI-powered content generation
- 👤 Influencer profile creation
- 📊 Analytics dashboard
- 💳 Subscription management
- 🔐 Secure authentication
- 🎨 Modern, responsive UI

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI API
- **Authentication**: Supabase Auth

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Your own Supabase project
- A Stripe account (test mode is fine)
- OpenAI, Replicate and Runway API keys for the generation features

### Installation

The backend and the frontend are separate packages with their own dependencies.
There is no root `package.json`; install and run each one from its own directory.

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install --prefix backend
   npm install --prefix frontend
   ```

3. Set up environment variables: copy `backend/env.example` to `backend/.env` and
   `frontend/env.example` to `frontend/.env`, then fill them in. There are no built-in
   defaults, so nothing points at someone else's services by accident.

   | Where | Required to start | Needed for features |
   |---|---|---|
   | `backend/.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `STRIPE_SECRET_KEY` | `STRIPE_WEBHOOK_SECRET` (payments), `OPENAI_API_KEY` (text), `REPLICATE_API_TOKEN` (images), `RUNWAY_API_KEY` (video) |
   | `frontend/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `VITE_API_URL` (defaults to `http://localhost:3001/api` in development), `VITE_STRIPE_PUBLISHABLE_KEY` |

   The backend refuses to start and names any missing required variable. The frontend shows a
   "not configured" screen listing what is missing.

4. Start the development servers, in two terminals:
   ```bash
   npm run dev --prefix backend     # API on http://localhost:3001
   npm run dev --prefix frontend    # app on http://localhost:5173
   ```

## Repository layout

```
eromify-app/
├── backend/          # Express API server
├── frontend/         # React + Vite app — THE deployed frontend (Vercel)
├── mcp/              # MCP server exposing the API to Claude and other clients
├── integrations/     # Workflow source for external automation (n8n)
├── deployment/       # Committed build output from deploy.sh — not source
└── supabase-schema.sql
```

**`frontend/` is the only frontend.** Every deploy script builds and ships it, and it
holds the Vercel configuration. Until September 2026 the repository also carried a second,
older copy of the app at the root (`src/`, `index.html`, `vite.config.js`); it was abandoned in
October 2025, reached no user, and had drifted far enough from `frontend/` — different
prices, different pages, different auth context — that changes made there were silently
lost, and comparisons against it produced wrong conclusions. It has been removed. If you find
yourself editing a frontend file that is not under `frontend/`, stop: it does not ship.

## MCP Server

`mcp/` ships an MCP server that exposes the Eromify API as tools, so you can manage influencers
and generate content from Claude or another MCP client:

```bash
npm install --prefix mcp
npx ./mcp install --client claude
npx ./mcp login
```

See [mcp/README.md](mcp/README.md) for the full tool list and the other supported clients.

## Development

- Backend runs on: http://localhost:3001
- Frontend runs on: http://localhost:5173
- Supabase Dashboard: https://supabase.com/dashboard

## License

MIT



