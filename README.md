# Personal OJT Tracker

Simple web app for logging OJT hours, viewing progress, and managing weekly reports.

## About
Personal OJT Tracker helps OJT trainees record daily attendance (time in/out), monitor completed hours, and organize weekly reports in one dashboard.
It is built for simple progress tracking during internship or on-the-job training.

## Tech Stack
- React + Vite
- Supabase (database + Google/Outlook OAuth)

## Quick Start
1. Install dependencies:
   - `npm install`
2. Run app locally:
   - `npm run dev`

## Environment Variables
Create a `.env` file for local use:

- `VITE_USE_SUPABASE_DIRECT=true`
- `VITE_SUPABASE_URL=your_supabase_project_url`
- `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`

## Supabase Setup
1. Create a Supabase project.
2. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
3. In Supabase Authentication, enable Google provider and set Google OAuth credentials.
4. In Supabase Authentication, enable Azure provider for Outlook/Microsoft login.
5. Add frontend env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Authentication
- Google and Outlook sign-in are supported.
- Email/password endpoints are disabled by design.

## Build
- `npm run build`
- `npm run preview`

## Deployment (Vercel + Supabase only)
- Set `VITE_USE_SUPABASE_DIRECT=true` in Vercel environment variables.
- Google login and data operations run directly against Supabase from the frontend.
