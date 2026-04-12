# Personal OJT Tracker

Web app for tracking OJT hours, progress, and weekly reports.

**Tech:** React + Vite | **Database:** Supabase with Row-Level Security  
**Auth:** Google OAuth, Microsoft OAuth, Email OTP  

## Quick Start
```bash
npm install
npm run dev
```

## Environment Variables
Create a `.env` file:
```
VITE_USE_SUPABASE_DIRECT=true
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_OAUTH_REDIRECT_URL=https://your-domain.com
```

## Setup
1. Create a Supabase project
2. Run `supabase/schema.sql` in Supabase SQL Editor
3. Enable Google & Azure OAuth in Supabase Authentication
4. Optionally enable Email OTP for magic-link sign-in
5. Add the env vars above

## Docker
```bash
docker compose up --build
```
Open `http://localhost:5173`

## Deploy to Vercel
1. Set the env vars in Vercel dashboard
2. Deploy — no backend required
3. Data is protected by Supabase RLS policies

