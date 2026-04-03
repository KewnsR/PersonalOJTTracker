# Personal OJT Tracker

Simple web app for logging OJT hours, viewing progress, and managing weekly reports.

## About
Personal OJT Tracker helps OJT trainees record daily attendance (time in/out), monitor completed hours, and organize weekly reports in one dashboard.
It is built for simple progress tracking during internship or on-the-job training.

## Key Features
- Track daily attendance with time in/out and notes.
- Monitor total completed OJT hours and progress trends.
- Manage weekly reports in one place.
- Authenticate users with Google OAuth.
- Store and load data from Supabase.

## Tech Stack
- React + Vite
- Supabase (database + Google/Outlook OAuth)

## Quick Start
1. Install dependencies:
   - `npm install`
2. Run app locally:
   - `npm run dev`

## Available Scripts
- `npm run dev`: Start the Vite development server.
- `npm run build`: Create a production build.
- `npm run preview`: Preview the production build locally.

## Environment Variables
Create a `.env` file for local use:

- `VITE_USE_SUPABASE_DIRECT=true` (recommended; frontend talks directly to Supabase)
- `VITE_SUPABASE_URL=your_supabase_project_url`
- `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`
- `VITE_OAUTH_REDIRECT_URL=https://your-domain.com` (optional, recommended for production OAuth)
- `VITE_API_URL=https://your-backend-url.com` (optional, only needed when not using direct Supabase mode)

## Supabase Setup
1. Create a Supabase project.
2. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
3. In Supabase Authentication, enable Google provider and set Google OAuth credentials.
4. Add frontend env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. For deployed OAuth stability, set `VITE_OAUTH_REDIRECT_URL` to your production URL.

## Authentication
- Google sign-in is supported.
- Email/password endpoints are disabled by design.

## Docker (Local Development)
1. Build and start the app in Docker:
   - `docker compose up --build`
2. Open the app:
   - `http://localhost:5173`
3. Stop containers:
   - `docker compose down`

Notes:
- This setup runs Vite dev server in a container with hot reload.
- Your local project folder is mounted into the container.
- If needed, keep your `.env` in the project root for Vite env variables.

## Deployment (Vercel + Supabase only)
- Set `VITE_USE_SUPABASE_DIRECT=true` in Vercel environment variables.
- Google login and data operations run directly against Supabase from the frontend.

## Troubleshooting
- Google login redirect mismatch: verify `VITE_OAUTH_REDIRECT_URL` and the authorized redirect URLs in Supabase/Google settings.
- App cannot load data: check `.env` values and confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are valid.
- If you use backend mode, make sure `VITE_API_URL` points to a reachable API base URL.
