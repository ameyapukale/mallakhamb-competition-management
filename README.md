# 🏆 Mallakhamb Competition Management System

A comprehensive full-stack web application for managing Mallakhamb competitions, including team registration, player management, lottery system, judge panels, scoring, and rankings.

## Features

### 👥 User Roles
- **Admin**: Full system access - manage competitions, users, panels, and results
- **Team Manager**: Register teams, add players, register for competitions
- **Judge**: View assigned panels and performance schedules
- **Scorer**: Enter scores for performances

### 📋 Core Features
- **Team Management**: Create and manage teams with player rosters
- **Player Registration**: Add players individually or in bulk with age group auto-detection
- **Competition Management**: Create competitions with multiple categories and age groups
- **Registration System**: Teams can register players for specific competition categories
- **Lottery System**: Random sequence allocation for fair performance order
- **Judge Panels**: Assign judges and scorers to specific categories
- **Scoring System**: Enter scores by criteria with real-time calculation
- **Rankings & Results**: View standings, winners, and team rankings

### 🎯 Mallakhamb Categories
- **Pole (मल्लखांब)**: Traditional pole mallakhamb
- **Rope (दोरी मल्लखांब)**: Rope mallakhamb
- **Hanging (हँगिंग मल्लखांब)**: Hanging mallakhamb

## Tech Stack

### Backend
- Node.js + Express.js
- MySQL Database
- JWT Authentication
- bcryptjs for password hashing

### Frontend
- React 18 with Vite
- React Router v6
- TanStack Query (React Query)
- Zustand for state management
- Tailwind CSS
- React Hook Form
- React Hot Toast

## Prerequisites

- Node.js 18+ 
- MySQL 8.0+
- npm or yarn

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
# Navigate to project directory
cd mallakhamb-competition-manager

# Install root dependencies
npm install

# Install all dependencies (client + server)
npm run install:all
```

### 2. Database Setup

1. Start MySQL server
2. Create the database and tables:

```bash
# Login to MySQL
mysql -u root -p

# Run the schema file
source database/schema.sql
```

Or manually:
```sql
CREATE DATABASE mallakhamb_competition;
USE mallakhamb_competition;
-- Then run the contents of database/schema.sql
```

### 3. Configure Environment Variables

Create `.env` file in the `server` directory:

```bash
cd server
cp .env.example .env
```

Edit `.env` with your settings:
```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=mallakhamb_competition

JWT_SECRET=your_super_secret_key_change_this
JWT_EXPIRES_IN=24h
```

### 4. Start the Application

```bash
# From project root - starts both frontend and backend
npm run dev
```

Or start separately:
```bash
# Terminal 1 - Backend (runs on port 5000)
npm run dev:server

# Terminal 2 - Frontend (runs on port 3000)
npm run dev:client
```

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- Health Check: http://localhost:5000/api/health

### Default Admin Login

After running the schema, a default admin user is created:
- **Username**: admin
- **Password**: admin123 (change this immediately!)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Teams
- `GET /api/teams` - List teams
- `POST /api/teams` - Create team
- `GET /api/teams/:id` - Get team details
- `PUT /api/teams/:id` - Update team

### Players
- `GET /api/players` - List players
- `POST /api/players` - Add player
- `POST /api/players/bulk` - Bulk add players
- `PUT /api/players/:id` - Update player

### Competitions
- `GET /api/competitions` - List competitions
- `POST /api/competitions` - Create competition
- `GET /api/competitions/:id` - Get competition details
- `PATCH /api/competitions/:id/status` - Update status

### Registrations
- `POST /api/registrations` - Register team for competition
- `GET /api/registrations/competition/:id` - Get competition registrations
- `PATCH /api/registrations/:id/status` - Update registration status

### Lottery
- `POST /api/lottery/conduct` - Conduct lottery draw
- `GET /api/lottery/sequence/:drawId` - Get performance sequence
- `PATCH /api/lottery/performance/:id/status` - Update performance status

### Judge Panels
- `GET /api/judge-panels/competition/:id` - Get panels for competition
- `POST /api/judge-panels` - Create panel
- `POST /api/judge-panels/:id/judges` - Add judge to panel
- `POST /api/judge-panels/:id/scorers` - Add scorer to panel

### Scoring
- `GET /api/scores/entry/:panelId/:performanceId` - Get scoring form data
- `POST /api/scores/submit-bulk` - Submit all scores for a performance
- `GET /api/scores/criteria/competition/:id` - Get scoring criteria

### Rankings
- `GET /api/rankings/competition/:id/category/:catId` - Get category rankings
- `POST /api/rankings/calculate/:compId/:catId` - Calculate rankings
- `GET /api/rankings/winners/:compId` - Get winners
- `GET /api/rankings/teams/:compId` - Get team standings

## Application Flow

### 1. Competition Setup (Admin)
1. Create competition with dates and details
2. Add categories (pole/rope/hanging) with age groups
3. Open registration
4. Create judge panels and assign judges/scorers

### 2. Team Registration (Team Manager)
1. Create team profile
2. Add players (individually or bulk)
3. Register team for competition
4. Select players for each category

### 3. Pre-Competition (Admin)
1. Approve team registrations
2. Close registration
3. Conduct lottery for each category
4. Generate performance schedule

### 4. During Competition (Scorer)
1. Start performances in sequence
2. Judges evaluate and call out scores
3. Scorer enters scores into system
4. Mark performance as complete

### 5. Results (Admin)
1. Calculate final rankings
2. View winners by category
3. View team standings
4. Export results

## Project Structure

```
mallakhamb-competition-manager/
├── client/                 # React frontend
│   ├── src/
│   │   ├── layouts/       # Page layouts
│   │   ├── pages/         # Page components
│   │   ├── services/      # API service
│   │   ├── store/         # Zustand stores
│   │   └── App.jsx        # Main app component
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── config/        # Database config
│   │   ├── middleware/    # Auth & validation
│   │   ├── routes/        # API routes
│   │   ├── utils/         # Utilities
│   │   └── index.js       # Server entry
│   └── package.json
├── database/
│   └── schema.sql         # MySQL schema
└── package.json           # Root package.json
```

## Default Age Groups

| Group | Age Range |
|-------|-----------|
| Sub-Junior | 6-10 years |
| Junior | 11-14 years |
| Sub-Youth | 15-17 years |
| Youth | 18-21 years |
| Senior | 22-35 years |
| Master | 36+ years |

## Default Scoring Criteria

| Criteria | Max Points | Weight |
|----------|------------|--------|
| Technique | 10 | 30% |
| Difficulty | 10 | 25% |
| Execution | 10 | 25% |
| Presentation | 10 | 10% |
| Time Management | 10 | 10% |

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC License

## Support

For issues and feature requests, please create an issue in the repository.

---

🙏 **जय मल्लखांब!** (Jai Mallakhamb!)

## Simplified flow (current)

The app now runs on a single admin login plus a public site:

1. **Admin** (`/login` → `/admin`) creates a competition and lists its **age groups** (name, Boys / Girls / Mixed,
   min–max age, and which apparatus — pole / rope / hanging — each group competes on). Ages are counted on the
   **"Age counted as on"** date, which defaults to 31 December of the competition year. Min or max
   age may be left empty for an open-ended group ("up to 9", "18 and above"). Boys and Girls groups may
   cover the same ages; otherwise groups must not overlap. Optionally set **Team score counts best N
   players**.
2. Set the status to **Registration open**. The **home page** (`/`) shows the competition with a
   **Register your team** button: team name + players (name, boy / girl, date of birth). The Marathi spelling of
   each name is filled in automatically (Google Input Tools via `/api/public/transliterate`, with an
   offline fallback) and can be corrected; it is printed on the score sheets. Each player's age
   group is decided from gender and DOB.
3. Score sheets are generated automatically: one per **age group × apparatus × team**, one row per player.
4. During the competition the admin opens **Score sheets**, enters the five judge scores and deduction;
   the average (of judges 1–4 the highest and lowest are circled and left out, the other two
   averaged; the head judge is not counted), final score and team score are calculated as you type and
   autosaved.
5. **Results** (admin and public `/results/:id`, refreshing every 5 s) show, per age group, the individual
   ranking (sum of finals across apparatus), the team ranking (per apparatus, the sum of the team's finals — or only its best N — added up), and an overall
   team table.

Database: run `database/migrations/008_public_registration_flow.sql` and
`009_gender_and_team_best_count.sql`, `010_player_marathi_name.sql`, `011_open_ended_age_groups.sql`, `012_team_points_three_decimals.sql`,
`013_player_dob_optional.sql` (all safe to re-run). Players added by the admin may have no date of
birth; they then stay in the age group the admin picked.
API: public endpoints under `/api/public`, admin endpoints under `/api/admin`
(see `server/src/routes/public.routes.js` and `admin.routes.js`).
