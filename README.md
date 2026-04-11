# Personal OJT Tracker

Simple web app for logging OJT hours, viewing progress, and managing weekly reports.

## About
Personal OJT Tracker helps OJT trainees record daily attendance (time in/out), monitor completed hours, and organize weekly reports in one dashboard.
It is built for simple progress tracking during internship or on-the-job training.

## Key Features
- Track daily attendance with time in/out and notes.
- Monitor total completed OJT hours and progress trends.
- Manage weekly reports in one place.
- Flexible authentication: Google OAuth, Microsoft/Outlook OAuth, or email OTP sign-in.
- Store and load data from Supabase with Row-Level Security (RLS).
- Direct Supabase mode for streamlined Vercel deployments (no backend required).

## Tech Stack
- React + Vite
- Supabase (database, authentication, Row-Level Security)
- Optional Node.js backend for custom logic (not required for Vercel deployments)

## Architecture
**Direct Supabase Mode (Default):**
- Frontend talks directly to Supabase for auth and data operations.
- All users' data is protected by Row-Level Security (RLS) policies at the database level.
- No backend server required; ideal for serverless deployments like Vercel.
- OAuth redirects handled by Supabase auth state listeners for reliable mobile support.

**Backend Mode (Optional):**
- A custom backend server proxies requests to Supabase (useful for rate-limiting, audit logging, or complex business logic).
- Set `VITE_USE_SUPABASE_DIRECT=false` and provide `VITE_API_URL` to use this mode.

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

### Direct Supabase Mode (Recommended for Vercel)
- `VITE_USE_SUPABASE_DIRECT=true` (frontend talks directly to Supabase)
- `VITE_SUPABASE_URL=your_supabase_project_url`
- `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`
- `VITE_OAUTH_REDIRECT_URL=https://your-domain.com` (optional for production OAuth)

### Backend Mode (Optional, if using a custom backend)
- `VITE_SUPABASE_DIRECT=false` (or omit to default to false)
- `VITE_API_URL=https://your-backend-url.com`

## Supabase Setup
1. Create a Supabase project.
2. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql) to create tables and enable Row-Level Security (RLS) policies.
3. In Supabase Authentication, enable the following OAuth providers:
   - **Google**: Standard provider for Google sign-in.
   - **Azure**: For Microsoft/Outlook sign-in (provider is normalized to `azure`).
4. Optionally enable Email OTP in Supabase Auth > Providers > Email for email magic-link sign-in.
5. Add frontend env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
6. For deployed OAuth stability, set `VITE_OAUTH_REDIRECT_URL` to your production URL.
7. All data access is protected by RLS; unauthenticated requests to the database are rejected.

## Authentication
- **Google OAuth**: Sign in with a Google account via Supabase OAuth provider.
- **Microsoft/Outlook OAuth**: Sign in with a Microsoft account via Supabase Azure provider.
- **Email OTP**: Magic-link sign-in via one-time verification code sent to email.
- Provider is normalized to `google`, `azure`, or `email` and stored in the user profile for consistent session handling.
- Legacy backend email/password endpoints are disabled by design.

## Magic Link Email Template (Recommended)
- In Supabase: `Authentication -> Email Templates -> Magic Link`.
- Keep a clear CTA to click the sign-in link and mention this is for OJT Tracker login.
- Include support text like: "If you did not request this email, ignore it."
- Suggested short copy:
   - Subject: `Sign in to OJT Tracker`
   - Body: `You requested to sign in to OJT Tracker. Please use the secure link below to continue.`
   - Footer: `If you did not request this email, you may safely ignore it.`

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
This app supports a streamlined deployment mode where no backend is required.

1. Set the following environment variables in Vercel:
   - `VITE_USE_SUPABASE_DIRECT=true` (enables direct Supabase communication)
   - `VITE_SUPABASE_URL=your_supabase_project_url`
   - `VITE_SUPABASE_ANON_KEY=your_supabase_anon_key`
   - `VITE_OAUTH_REDIRECT_URL=https://your-vercel-domain.com` (for OAuth callback)
2. Deploy to Vercel; all authentication and data operations run directly against Supabase from the frontend.
3. Row-Level Security (RLS) policies in Supabase protect user data at the database level.

