# Qboard - Dog Boarding Manager

A modern web application for managing dog boarding businesses. Track bookings, calculate revenue, manage employees, and more.

## Features

- **Visual Calendar** - See all bookings at a glance with color-coded dogs
- **Boarding Matrix** - Daily breakdown of dogs, rates, and revenue
- **Dog Management** - Track dogs with custom day/night rates
- **Employee Tracking** - Assign employees to nights, calculate earnings
- **Payroll** - Track and manage employee payments
- **Mobile-First PWA** - Install on your phone, works offline
- **Secure Multi-User** - Each user sees only their own data
- **CSV Import** - Bulk import bookings from spreadsheets

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/dog-boarding.git
cd dog-boarding

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL from `supabase/schema.sql` in the SQL editor
3. Copy your project URL and anon key to `.env.local`

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Testing:** Vitest, React Testing Library

## Development

```bash
# Run development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Run linting
npm run lint
```

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page components (routed)
├── hooks/          # Custom React hooks (Supabase data)
├── utils/          # Utility functions
├── context/        # React contexts
└── lib/            # External library setup
```

## License

MIT License - see [LICENSE](LICENSE) for details.
