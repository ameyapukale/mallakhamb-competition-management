# Mallakhamb Competition Manager - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Database Schema](#database-schema)
5. [User Roles & Permissions](#user-roles--permissions)
6. [Application Flow](#application-flow)
7. [API Endpoints](#api-endpoints)
8. [Frontend Pages](#frontend-pages)
9. [Setup Instructions](#setup-instructions)
10. [Key Features](#key-features)

---

## Overview

The **Mallakhamb Competition Manager** is a comprehensive web application designed to manage Mallakhamb (traditional Indian pole gymnastics) competitions. It handles the complete lifecycle of a competition including:

- Team and player registration
- Competition creation and management
- Judge panel assignment
- Lottery-based performance sequencing
- Real-time scoring by judges
- Rankings and results generation

---

## Technology Stack

### Frontend
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **React Router v6** - Client-side routing
- **TanStack Query (React Query)** - Server state management
- **Zustand** - Client state management (auth store)
- **React Hook Form** - Form handling
- **React Hot Toast** - Notifications
- **React Icons (Feather)** - Icon library

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **MySQL** (MariaDB compatible) - Database
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **express-validator** - Request validation
- **mysql2** - MySQL driver with connection pooling

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │  Pages   │  │ Services │  │  Store   │  │    Components    ││
│  │          │  │  (API)   │  │ (Zustand)│  │                  ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘│
└───────┼─────────────┼─────────────┼─────────────────┼──────────┘
        │             │             │                 │
        └─────────────┴──────┬──────┴─────────────────┘
                             │ HTTP/REST
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVER (Express)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │  Routes  │  │Middleware│  │  Utils   │  │     Config       ││
│  │          │  │(Auth/Val)│  │(Logger)  │  │   (Database)     ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘│
└───────┼─────────────┼─────────────┼─────────────────┼──────────┘
        │             │             │                 │
        └─────────────┴──────┬──────┴─────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE (MySQL)                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐ │
│  │  Users  │ │  Teams  │ │ Players │ │Competi- │ │  Scores   │ │
│  │         │ │         │ │         │ │ tions   │ │           │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Core Tables

#### 1. Users
Stores all user accounts with role-based access.
```sql
- id, username, password_hash, email
- role: 'admin' | 'team_manager' | 'judge' | 'scorer'
- full_name, phone, is_active
```

#### 2. Teams
Teams managed by team managers.
```sql
- id, team_name, team_code (unique, auto-generated)
- organization_name, address, city, state, country
- manager_id (FK to users)
- contact_phone, contact_email, logo_url
```

#### 3. Players
Players belonging to teams.
```sql
- id, team_id, first_name, last_name
- date_of_birth, gender, age_group_id (auto-calculated)
- registration_number (unique, auto-generated)
- category: 'pole' | 'rope' | 'hanging'
- height_cm, weight_kg, experience_years, achievements
```

#### 4. Age Groups
Predefined age categories for competition.
```sql
- id, group_name, min_age, max_age
- Default: Sub-Junior(6-10), Junior(11-14), Sub-Youth(15-17), 
           Youth(18-21), Senior(22-35), Master(36+)
```

#### 5. Competitions
Competition events.
```sql
- id, competition_name, competition_code
- venue, address, city, state
- start_date, end_date
- registration_start_date, registration_end_date
- max_teams, max_players_per_team
- entry_fee, prize_pool
- status: 'draft' | 'registration_open' | 'registration_closed' | 
          'ongoing' | 'completed' | 'cancelled'
- created_by (FK to users)
```

#### 6. Competition Categories
Categories available in each competition (combination of equipment + age group).
```sql
- id, competition_id
- category: 'pole' | 'rope' | 'hanging'
- age_group_id, max_participants
- UNIQUE: (competition_id, category, age_group_id)
```

#### 7. Competition Registrations
Team registrations for competitions.
```sql
- id, competition_id, team_id
- payment_status, payment_amount, payment_reference
- status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
- UNIQUE: (competition_id, team_id)
```

#### 8. Competition Entries
Individual player entries for specific categories.
```sql
- id, competition_id, registration_id, player_id
- competition_category_id, entry_number
- status: 'registered' | 'confirmed' | 'withdrawn' | 'disqualified'
- UNIQUE: (competition_id, player_id, competition_category_id)
```

### Lottery & Performance Tables

#### 9. Lottery Draws
Records of lottery conducted per category.
```sql
- id, competition_id, competition_category_id
- draw_date, status, conducted_by, remarks
```

#### 10. Performance Sequences
Random order of performances (result of lottery).
```sql
- id, lottery_draw_id, competition_entry_id
- sequence_number, performance_status
- scheduled_time, actual_start_time, actual_end_time
```

### Judging & Scoring Tables

#### 11. Judge Panels
Panels assigned to each competition category.
```sql
- id, competition_id, competition_category_id
- panel_name, panel_code
```

#### 12. Panel Members
Judges assigned to panels.
```sql
- id, panel_id, judge_id
- role: 'head_judge' | 'judge' | 'technical_judge'
```

#### 13. Panel Scorers
Scorers assigned to enter scores on behalf of judges.
```sql
- id, panel_id, scorer_id
```

#### 14. Scoring Criteria
Criteria for judging performances.
```sql
- id, competition_id (null for defaults)
- criteria_name, description, max_points, weight_percentage
- Default: Technique(30%), Difficulty(25%), Execution(25%), 
           Presentation(10%), Time Management(10%)
```

#### 15. Scores
Individual scores given by judges.
```sql
- id, performance_sequence_id, panel_member_id
- scoring_criteria_id, score, remarks
- entered_by (scorer who entered)
```

#### 16. Final Scores
Aggregated final scores and rankings.
```sql
- id, competition_entry_id
- total_score, average_score, rank_position
- rank_status: 'gold' | 'silver' | 'bronze' | 'participant'
```

---

## User Roles & Permissions

### 1. Admin
- **Full access** to all features
- Create/manage competitions
- Manage users, age groups
- Approve registrations
- Create judge panels
- Conduct lottery
- View all data

### 2. Team Manager
- Create and manage their own teams
- Add/edit players to their teams
- Register teams for competitions
- View their registrations and schedules

### 3. Judge
- View assigned panels
- View performance schedules
- (Scores entered by scorers on their behalf)

### 4. Scorer
- Enter scores for judges in assigned panels
- View scoring dashboard
- Submit and edit scores during performances

---

## Application Flow

### 1. Competition Setup Flow (Admin)
```
Create Competition → Add Categories → Open Registration
         ↓
   Set dates, venue, fees, rules
         ↓
   Add categories (pole/rope/hanging + age groups)
         ↓
   Change status to "registration_open"
```

### 2. Team Registration Flow (Team Manager)
```
Create Team → Add Players → Register for Competition
      ↓              ↓                 ↓
 Auto-generate   Assign category    Select team
 team_code       & DOB (auto        Select players
                 age-group)         Map to categories
```

### 3. Pre-Competition Flow (Admin)
```
Approve Registrations → Create Judge Panels → Conduct Lottery
         ↓                      ↓                    ↓
   Review team/player      Assign judges       Random sequence
   entries                 Assign scorers      generated
```

### 4. Competition Day Flow
```
Performance Schedule → Scoring → Rankings
        ↓                 ↓          ↓
  Call players by     Scorers      Auto-calculate
  sequence number     enter marks  total scores
                                   and ranks
```

### 5. Complete Flow Diagram
```
┌──────────────────────────────────────────────────────────────────┐
│                        ADMIN SETUP                               │
│  ┌───────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ Create    │ → │ Add          │ → │ Open Registration      │  │
│  │Competition│   │ Categories   │   │ (change status)        │  │
│  └───────────┘   └──────────────┘   └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                    TEAM MANAGER REGISTRATION                     │
│  ┌───────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ Create    │ → │ Add Players  │ → │ Register for           │  │
│  │ Team      │   │              │   │ Competition            │  │
│  └───────────┘   └──────────────┘   └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                      ADMIN PRE-COMPETITION                       │
│  ┌───────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ Approve   │ → │ Create Judge │ → │ Conduct Lottery        │  │
│  │Registratio│   │ Panels       │   │ (Random Sequence)      │  │
│  └───────────┘   └──────────────┘   └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│                       COMPETITION DAY                            │
│  ┌───────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │Performance│ → │ Score Entry  │ → │ Calculate Rankings     │  │
│  │ Schedule  │   │ (by Scorers) │   │ & Declare Winners      │  │
│  └───────────┘   └──────────────┘   └────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/register` | Register new user | Public |
| POST | `/login` | User login | Public |
| GET | `/me` | Get current user | Authenticated |
| POST | `/change-password` | Change password | Authenticated |

### Teams (`/api/teams`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | List all teams | Authenticated |
| GET | `/:id` | Get team details | Authenticated |
| POST | `/` | Create team | Team Manager |
| PUT | `/:id` | Update team | Team Manager (owner) |
| DELETE | `/:id` | Delete team | Team Manager (owner) |

### Players (`/api/players`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | List players | Authenticated |
| GET | `/:id` | Get player | Authenticated |
| POST | `/` | Add player | Team Manager |
| PUT | `/:id` | Update player | Team Manager |
| DELETE | `/:id` | Remove player | Team Manager |
| POST | `/bulk` | Bulk add players | Team Manager |
| GET | `/team/:teamId/by-age-group` | Get players grouped by age | Authenticated |

### Competitions (`/api/competitions`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | List competitions | Authenticated |
| GET | `/:id` | Get competition | Authenticated |
| POST | `/` | Create competition | Admin |
| PUT | `/:id` | Update competition | Admin |
| PATCH | `/:id/status` | Update status | Admin |
| POST | `/:id/categories` | Add category | Admin |
| GET | `/:id/categories` | Get categories | Authenticated |

### Registrations (`/api/registrations`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/competition/:id` | Get competition registrations | Authenticated |
| GET | `/team/:id` | Get team registrations | Authenticated |
| POST | `/` | Register team | Team Manager |
| PATCH | `/:id/status` | Update registration status | Admin |

### Judge Panels (`/api/judge-panels`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/competition/:id` | Get panels for competition | Authenticated |
| GET | `/:id` | Get panel details | Authenticated |
| POST | `/` | Create panel | Admin |
| POST | `/:id/judges` | Add judge to panel | Admin |
| POST | `/:id/scorers` | Add scorer to panel | Admin |

### Lottery (`/api/lottery`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/competition/:id` | Get lottery status | Authenticated |
| GET | `/sequence/:lotteryDrawId` | Get performance sequence | Authenticated |
| POST | `/conduct` | Conduct lottery | Admin |
| PATCH | `/sequence/:id/status` | Update performance status | Admin/Scorer |

### Scores (`/api/scores`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/criteria/competition/:id` | Get scoring criteria | Authenticated |
| POST | `/criteria` | Create custom criteria | Admin |
| GET | `/performance/:id` | Get scores for performance | Authenticated |
| POST | `/submit` | Submit scores | Scorer |
| POST | `/finalize/:performanceId` | Finalize scores | Admin |

### Rankings (`/api/rankings`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/competition/:id` | Get competition rankings | Authenticated |
| GET | `/competition/:id/category/:catId` | Get category rankings | Authenticated |
| POST | `/calculate/:competitionId` | Calculate final rankings | Admin |

### Age Groups (`/api/age-groups`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | List age groups | Authenticated |
| GET | `/:id` | Get age group | Authenticated |
| POST | `/` | Create age group | Admin |
| PUT | `/:id` | Update age group | Admin |
| DELETE | `/:id` | Delete age group | Admin |

### Users (`/api/users`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | List users | Admin |
| GET | `/:id` | Get user | Authenticated |
| PUT | `/:id` | Update user | Admin/Self |
| PATCH | `/:id/status` | Activate/Deactivate | Admin |
| GET | `/role/:role` | Get users by role | Authenticated |

---

## Frontend Pages

### Authentication
| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | Login.jsx | User login form |
| `/register` | Register.jsx | New user registration |

### Dashboard
| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | Dashboard.jsx | Role-based dashboard with stats |

### Teams
| Route | Component | Description |
|-------|-----------|-------------|
| `/teams` | Teams.jsx | List all teams |
| `/teams/create` | CreateTeam.jsx | Create new team |
| `/teams/:id` | TeamDetail.jsx | Team details and players |

### Players
| Route | Component | Description |
|-------|-----------|-------------|
| `/players` | Players.jsx | List all players |
| `/players/add` | AddPlayer.jsx | Add single player |
| `/players/bulk-add` | BulkAddPlayers.jsx | Bulk add players |

### Competitions
| Route | Component | Description |
|-------|-----------|-------------|
| `/competitions` | Competitions.jsx | List competitions |
| `/competitions/create` | CreateCompetition.jsx | Create competition |
| `/competitions/:id` | CompetitionDetail.jsx | Competition details |
| `/competitions/:id/register` | CompetitionRegistration.jsx | Register team |

### Judge Panels
| Route | Component | Description |
|-------|-----------|-------------|
| `/panels` | JudgePanels.jsx | List judge panels |
| `/panels/:id` | PanelDetail.jsx | Panel details |

### Lottery & Schedule
| Route | Component | Description |
|-------|-----------|-------------|
| `/lottery/:competitionId` | LotteryDraw.jsx | Conduct lottery |
| `/schedule/:competitionId` | PerformanceSchedule.jsx | View schedule |

### Scoring
| Route | Component | Description |
|-------|-----------|-------------|
| `/scoring` | ScoringDashboard.jsx | Scorer dashboard |
| `/scoring/:panelId/:performanceId` | ScoreEntry.jsx | Enter scores |

### Rankings
| Route | Component | Description |
|-------|-----------|-------------|
| `/rankings/:competitionId` | Rankings.jsx | Individual rankings |
| `/rankings/:competitionId/teams` | TeamRankings.jsx | Team rankings |
| `/rankings/:competitionId/winners` | Winners.jsx | Medal winners |

### Admin
| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/users` | Users.jsx | Manage users |
| `/admin/age-groups` | AgeGroups.jsx | Manage age groups |

---

## Setup Instructions

### Prerequisites
- Node.js v18+
- MySQL 8.0+ or MariaDB 10.4+
- npm or yarn

### 1. Database Setup
```bash
# Connect to MySQL
mysql -u root -p

# Create and import database
SOURCE D:/mallakhamb-competition-manager/database/schema.sql;
```

### 2. Server Setup
```bash
cd server
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials:
# DB_HOST=localhost
# DB_USER=root
# DB_PASSWORD=your_password
# DB_NAME=mallakhamb_competition
# JWT_SECRET=your_secret_key
# PORT=5000

# Start server
npm run dev
```

### 3. Client Setup
```bash
cd client
npm install

# Start development server
npm run dev
```

### 4. Default Admin Login
- **Username:** admin
- **Password:** admin123

---

## Key Features

### 1. Auto-Generated Codes
- **Team Code:** `TM-XXXXXXXX` (UUID-based)
- **Competition Code:** `COMP-XXXXXXXX`
- **Player Registration:** `PL-XXXXXXXX`

### 2. Auto Age Group Assignment
When adding a player, the system automatically calculates their age from DOB and assigns the appropriate age group.

### 3. Category Matching
Players can only be registered for competition categories that match:
- Their equipment category (pole/rope/hanging)
- Their age group

### 4. Lottery System
Uses Fisher-Yates shuffle algorithm for fair random sequence generation.

### 5. Scoring System
- Multiple judges can score each performance
- Scores are entered by scorers on behalf of judges
- Weighted criteria for final score calculation
- Automatic ranking based on total scores

### 6. Activity Logging
All important actions are logged in `activity_logs` table for audit trail.

---

## Important Notes

### Validation Rules
1. **Undefined to NULL:** All optional fields in INSERT statements default to `null` instead of `undefined` (MySQL requirement)
2. **String to Number:** Age comparisons use `Number()` conversion to avoid string comparison issues
3. **Duplicate Prevention:** Player entries are checked before insertion to prevent duplicates

### Security
- JWT tokens expire in 24 hours
- Passwords hashed with bcrypt (10 rounds)
- Role-based middleware protects all routes
- Input validation on all endpoints

### Error Handling
- Transactions used for multi-table operations
- Rollback on failure
- Detailed error messages in development
- Generic messages in production

---

## Future Enhancements
- [ ] Real-time score updates (WebSocket)
- [ ] PDF certificate generation
- [ ] Photo/video upload for performances
- [ ] Mobile app for judges
- [ ] Multi-language support
- [ ] Payment gateway integration
- [ ] Email notifications
- [ ] Export reports to Excel/PDF

---

*Documentation last updated: June 2026*
