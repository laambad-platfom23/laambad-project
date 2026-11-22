# Sodemy Frontend

A modern, production-ready frontend for the **Sodemy** learning platform built with Next.js, TypeScript, TailwindCSS, and ShadCN UI components.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** TailwindCSS + CSS Variables (dark/light mode)
- **UI Components:** ShadCN-style (Radix UI + CVA + Tailwind)
- **State Management:** Zustand (auth), React Query (server state)
- **HTTP Client:** Axios (with JWT interceptors & auto refresh)
- **Charts:** Recharts
- **Notifications:** Sonner
- **Icons:** Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Backend API running at `http://localhost:8080`

### Installation

```bash
cd sodemy-frontend
npm install
```

### Environment Variables

Create `.env.local` (already included):

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_APP_NAME=Sodemy
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Landing page
│   ├── layout.tsx          # Root layout (providers, theme, toaster)
│   ├── login/              # Login page
│   ├── register/           # Register page
│   └── dashboard/          # Protected dashboard pages
│       ├── page.tsx        # Dashboard overview with charts
│       ├── layout.tsx      # Dashboard layout (sidebar + navbar)
│       ├── users/          # User management
│       ├── courses/        # Course management
│       ├── enrollments/    # Enrollment tracking
│       ├── assignments/    # Assignment management
│       ├── research/       # Research papers
│       ├── notifications/  # Notifications
│       ├── files/          # File upload/management
│       └── settings/       # Account settings
├── components/
│   ├── ui/                 # Reusable UI primitives (ShadCN-style)
│   ├── layout/             # Sidebar, Navbar, DashboardLayout
│   └── providers/          # React Query, Theme providers
├── hooks/                  # Custom React hooks (useAuth)
├── lib/                    # Utilities (cn, formatDate, etc.)
├── services/api/           # API layer (Axios client + all service files)
├── store/                  # Zustand auth store
└── types/                  # TypeScript type definitions
```

## Features

- **Landing Page** — Modern hero, features, stats, CTA sections
- **Auth** — JWT login/register with auto token refresh
- **Dashboard** — Analytics cards, area/bar charts (Recharts)
- **Users** — Paginated list with search and avatars
- **Courses** — Grid view, create dialog, pagination
- **Enrollments** — Progress tracking with visual bars
- **Assignments** — List view with due dates and scoring
- **Research** — Paper management with status badges
- **Notifications** — Read/unread with mark-all-read
- **Files** — Drag-and-drop style upload interface
- **Settings** — Profile editing, notification toggles, danger zone
- **Dark Mode** — Full theme support via next-themes
- **Collapsible Sidebar** — Responsive navigation

## Design System

| Token     | Value     |
|-----------|-----------|
| Primary   | `#14383a` |
| Secondary | `#64d88c` |
| Style     | Minimalist, rounded, soft shadows, glassmorphism |

## API Integration

All API calls go through `src/services/api/client.ts` which:

1. Attaches JWT `Authorization` header automatically
2. Intercepts 401 responses and attempts token refresh
3. Redirects to `/login` on auth failure
4. Supports all backend endpoints (auth, users, courses, enrollments, assignments, research, notifications, files)
