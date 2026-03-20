# Personal OJT Tracker

Simple web app for logging OJT hours, viewing progress, and managing weekly reports.

## About
Personal OJT Tracker helps OJT trainees record daily attendance (time in/out), monitor completed hours, and organize weekly reports in one dashboard.
It is built for simple progress tracking during internship or on-the-job training.

## Tech Stack
- React + Vite
- Node.js + Express
- Firebase Auth / Firebase Admin

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
- `JWT_SECRET=your_secret_here`
- `FIREBASE_SERVICE_ACCOUNT_JSON=your_firebase_service_account_json`

## Build
- `npm run build`
- `npm run preview`

## Deployment (Render)
This project includes `render.yaml` for API deployment.
