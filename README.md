# Daily Task Tracker

Personal task tracking app with daily habits, one-time tasks, and accountability features.

## Features

- 📝 Daily habit tracking with streak counting
- ✅ One-time task management
- 📅 28-day calendar view with completion percentages
- 📝 Failure note tracking for accountability
- 📤 Export functionality for AI assistant context
- 🔒 Secure authentication with Supabase Auth

## Setup

### Prerequisites
- Node.js 20.x or higher
- Supabase account

### Installation

1. Clone repository:
   ```bash
   git clone <repository-url>
   cd tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your Supabase credentials

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Deployment

Deploy to mase.fi/tracker:

```bash
git push production main
```

Push to GitHub:

```bash
git push origin main
```

## Technology Stack

- **Frontend**: Vanilla JavaScript, Tailwind CSS (CDN)
- **Backend**: Supabase (PostgreSQL + Auth)
- **Build**: Vite
- **Hosting**: Self-hosted on UpCloud VPS with Nginx

## Database Schema

- `tasks` - Task definitions with user ownership
- `completions` - Task completion records with failure notes
- Row Level Security enabled for data isolation

## Security

- Authentication required via Supabase Auth
- Row Level Security policies enforce user data isolation
- Environment variables for credential management
- No hardcoded API keys in source code

## License

Private project - not for public distribution
