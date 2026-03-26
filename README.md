# Personal OJT Tracker

Simple web app for logging OJT hours, viewing progress, and managing weekly reports.

## About
Personal OJT Tracker helps OJT trainees record daily attendance (time in/out), monitor completed hours, and organize weekly reports in one dashboard.
It is built for simple progress tracking during internship or on-the-job training.

## Tech Stack
- React + Vite
- Node.js + Express
- Supabase (database + Google OAuth)

## Quick Start
1. Install dependencies:
   - `npm install`
2. Run frontend only:
   - `npm run dev`
3. Run backend only:
   - `npm run server`
4. Run frontend + backend together:
   - `npm run dev:full`

## Environment Variables
Create a `.env` file for local use:

- `VITE_API_URL=http://localhost:5000`
- `VITE_SUPABASE_URL=your_supabase_project_url`
- `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`
- `JWT_SECRET=your_secret_here`
- `SUPABASE_URL=your_supabase_project_url`
- `SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key`

## Supabase Setup
1. Create a Supabase project.
2. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
3. In Supabase Authentication, enable Google provider and set Google OAuth credentials.
4. Add frontend env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. Add backend env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Authentication
- Only Google sign-in is supported.
- Email/password endpoints are disabled by design.

## Build
- `npm run build`
- `npm run preview`

## Deployment (Render)
This project includes `render.yaml` for API deployment.
