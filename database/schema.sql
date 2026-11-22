-- Mallakhamb Competition Management System - Database Schema
-- MySQL Database

-- Create the database
CREATE DATABASE IF NOT EXISTS mallakhamb_competition;
USE mallakhamb_competition;

-- =====================================================
-- USER AND AUTHENTICATION TABLES
-- =====================================================

-- Users table (for authentication)
-- Username and email are unique PER ROLE, so one person can hold e.g. a judge
-- account and a team_manager account under the same username and email.
-- Because a username no longer identifies one account, login verifies the password
-- against every account sharing it and asks the user to choose a role when more
-- than one matches (see auth.routes.js).
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    role ENUM('admin', 'team_manager', 'judge', 'scorer') NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_username_role (username, role),
    UNIQUE KEY unique_email_role (email, role)
);

-- =====================================================
-- TEAM AND PLAYER TABLES
-- =====================================================

-- Teams table
CREATE TABLE teams (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_name VARCHAR(100) NOT NULL,
    team_code VARCHAR(20) UNIQUE NOT NULL,
    organization_name VARCHAR(150),
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    country VARCHAR(50) DEFAULT 'India',
    manager_id INT,
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    logo_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Age groups table
CREATE TABLE age_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    group_name VARCHAR(50) NOT NULL,
    min_age INT NOT NULL,
    max_age INT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_age_range (min_age, max_age)
);

-- Players table
CREATE TABLE players (
    id INT PRIMARY KEY AUTO_INCREMENT,
    team_id INT NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('male', 'female', 'other') NOT NULL,
    age_group_id INT,
    registration_number VARCHAR(30) UNIQUE,
    aadhar_number VARCHAR(12),
    photo_url VARCHAR(255),
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    category ENUM('pole', 'rope', 'hanging') NOT NULL,
    experience_years INT DEFAULT 0,
    achievements TEXT,
    medical_certificate_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (age_group_id) REFERENCES age_groups(id) ON DELETE SET NULL,
    INDEX idx_team (team_id),
    INDEX idx_age_group (age_group_id),
    INDEX idx_category (category)
);

-- =====================================================
-- COMPETITION TABLES
-- =====================================================

-- Competitions table
CREATE TABLE competitions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_name VARCHAR(150) NOT NULL,
    competition_code VARCHAR(30) UNIQUE NOT NULL,
    description TEXT,
    venue VARCHAR(200),
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    registration_start_date DATE NOT NULL,
    registration_end_date DATE NOT NULL,
    max_teams INT,
    max_players_per_team INT,
    entry_fee DECIMAL(10,2) DEFAULT 0.00,
    prize_pool DECIMAL(15,2) DEFAULT 0.00,
    status ENUM('draft', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled') DEFAULT 'draft',
    rules TEXT,
    organizer_name VARCHAR(100),
    organizer_contact VARCHAR(100),
    logo_url VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_status (status),
    INDEX idx_dates (start_date, end_date)
);

-- Competition categories (which categories are in which competition)
CREATE TABLE competition_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    category ENUM('pole', 'rope', 'hanging') NOT NULL,
    age_group_id INT NOT NULL,
    max_participants INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (age_group_id) REFERENCES age_groups(id) ON DELETE CASCADE,
    UNIQUE KEY unique_comp_cat_age (competition_id, category, age_group_id)
);

-- Team registrations for competition
CREATE TABLE competition_registrations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    team_id INT NOT NULL,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    payment_amount DECIMAL(10,2),
    payment_reference VARCHAR(100),
    status ENUM('pending', 'approved', 'rejected', 'withdrawn') DEFAULT 'pending',
    remarks TEXT,
    approved_by INT,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_comp_team (competition_id, team_id),
    INDEX idx_status (status)
);

-- Player entries for competition (which players are participating)
CREATE TABLE competition_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    registration_id INT NOT NULL,
    player_id INT NOT NULL,
    competition_category_id INT NOT NULL,
    entry_number VARCHAR(20),
    status ENUM('registered', 'confirmed', 'withdrawn', 'disqualified') DEFAULT 'registered',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (registration_id) REFERENCES competition_registrations(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_category_id) REFERENCES competition_categories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_player_entry (competition_id, player_id, competition_category_id),
    INDEX idx_player (player_id),
    INDEX idx_category (competition_category_id)
);

-- =====================================================
-- LOTTERY / PERFORMANCE SEQUENCE TABLES
-- =====================================================

-- Lottery draws table
CREATE TABLE lottery_draws (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    competition_category_id INT NOT NULL,
    draw_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    conducted_by INT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_category_id) REFERENCES competition_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (conducted_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_draw (competition_id, competition_category_id)
);

-- Performance sequence (result of lottery)
CREATE TABLE performance_sequences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lottery_draw_id INT NOT NULL,
    competition_entry_id INT NOT NULL,
    sequence_number INT NOT NULL,
    performance_status ENUM('pending', 'performing', 'completed', 'skipped', 'disqualified') DEFAULT 'pending',
    scheduled_time TIME,
    actual_start_time TIMESTAMP NULL,
    actual_end_time TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (lottery_draw_id) REFERENCES lottery_draws(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_entry_id) REFERENCES competition_entries(id) ON DELETE CASCADE,
    UNIQUE KEY unique_sequence (lottery_draw_id, sequence_number),
    UNIQUE KEY unique_entry_sequence (lottery_draw_id, competition_entry_id),
    INDEX idx_status (performance_status)
);

-- =====================================================
-- JUDGE PANEL TABLES
-- =====================================================

-- Judge panels for each category/age group
CREATE TABLE judge_panels (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    competition_category_id INT NOT NULL,
    panel_name VARCHAR(100) NOT NULL,
    panel_code VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_category_id) REFERENCES competition_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_competition (competition_id)
);

-- Panel members (judges assigned to panels)
-- `position` is the real panel slot; `role` is legacy and read only by score.routes.js.
-- A member is identified EITHER by judge_id (a real account) OR by member_name (typed
-- in free text, allowed only for the two non-scoring slots).
-- unique_panel_judge is what stops one account holding two positions on a panel;
-- duplicate typed names are rejected in judgePanel.routes.js, since unique keys
-- permit repeated NULLs.
CREATE TABLE panel_members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    panel_id INT NOT NULL,
    judge_id INT NULL,
    member_name VARCHAR(100) NULL,
    position ENUM(
        'judge_1', 'judge_2', 'judge_3', 'judge_4', 'judge_5',
        'scorer', 'time_keeper'
    ) NOT NULL DEFAULT 'judge_1',
    role ENUM('head_judge', 'judge', 'technical_judge') DEFAULT 'judge',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (panel_id) REFERENCES judge_panels(id) ON DELETE CASCADE,
    FOREIGN KEY (judge_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_panel_judge (panel_id, judge_id),
    UNIQUE KEY unique_panel_position (panel_id, position),
    CONSTRAINT chk_member_identity CHECK (
        (judge_id IS NOT NULL AND member_name IS NULL)
     OR (judge_id IS NULL AND member_name IS NOT NULL)
    ),
    CONSTRAINT chk_free_text_slots CHECK (
        member_name IS NULL OR position IN ('scorer', 'time_keeper')
    )
);

-- Judges who have registered themselves for a competition.
-- Panel position dropdowns are populated from this table.
CREATE TABLE competition_judges (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    judge_id INT NOT NULL,
    status ENUM('registered', 'withdrawn') NOT NULL DEFAULT 'registered',
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (judge_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_comp_judge (competition_id, judge_id),
    INDEX idx_competition_status (competition_id, status)
);

-- Scorers assigned to panels
CREATE TABLE panel_scorers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    panel_id INT NOT NULL,
    scorer_id INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (panel_id) REFERENCES judge_panels(id) ON DELETE CASCADE,
    FOREIGN KEY (scorer_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_panel_scorer (panel_id, scorer_id)
);

-- =====================================================
-- SCORING TABLES
-- =====================================================

-- Scoring criteria
CREATE TABLE scoring_criteria (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT,
    criteria_name VARCHAR(100) NOT NULL,
    description TEXT,
    max_points DECIMAL(5,2) NOT NULL,
    weight_percentage DECIMAL(5,2) DEFAULT 100.00,
    category ENUM('pole', 'rope', 'hanging'),
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE
);

-- Scores given by judges
CREATE TABLE scores (
    id INT PRIMARY KEY AUTO_INCREMENT,
    performance_sequence_id INT NOT NULL,
    panel_member_id INT NOT NULL,
    scoring_criteria_id INT NOT NULL,
    score DECIMAL(5,2) NOT NULL,
    remarks TEXT,
    entered_by INT NOT NULL,
    entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (performance_sequence_id) REFERENCES performance_sequences(id) ON DELETE CASCADE,
    FOREIGN KEY (panel_member_id) REFERENCES panel_members(id) ON DELETE CASCADE,
    FOREIGN KEY (scoring_criteria_id) REFERENCES scoring_criteria(id) ON DELETE CASCADE,
    FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_score (performance_sequence_id, panel_member_id, scoring_criteria_id),
    INDEX idx_performance (performance_sequence_id)
);

-- Final calculated scores (aggregated)
CREATE TABLE final_scores (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_entry_id INT NOT NULL,
    total_score DECIMAL(8,2) NOT NULL,
    average_score DECIMAL(5,2),
    rank_position INT,
    rank_status ENUM('gold', 'silver', 'bronze', 'participant') DEFAULT 'participant',
    is_disqualified BOOLEAN DEFAULT FALSE,
    disqualification_reason TEXT,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_entry_id) REFERENCES competition_entries(id) ON DELETE CASCADE,
    UNIQUE KEY unique_final (competition_entry_id),
    INDEX idx_rank (rank_position)
);

-- =====================================================
-- AUDIT AND LOGS
-- =====================================================

-- Activity logs
CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INT,
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at)
);

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Insert default age groups
INSERT INTO age_groups (group_name, min_age, max_age, description) VALUES
('Sub-Junior', 6, 10, 'Children aged 6 to 10 years'),
('Junior', 11, 14, 'Children aged 11 to 14 years'),
('Sub-Youth', 15, 17, 'Youth aged 15 to 17 years'),
('Youth', 18, 21, 'Youth aged 18 to 21 years'),
('Senior', 22, 35, 'Adults aged 22 to 35 years'),
('Master', 36, 100, 'Adults aged 36 and above');

-- Insert default scoring criteria
INSERT INTO scoring_criteria (criteria_name, description, max_points, weight_percentage, is_default, is_active) VALUES
('Technique', 'Correctness of technique and form', 10.00, 30.00, TRUE, TRUE),
('Difficulty', 'Level of difficulty of performed moves', 10.00, 25.00, TRUE, TRUE),
('Execution', 'Quality of execution and control', 10.00, 25.00, TRUE, TRUE),
('Presentation', 'Overall presentation and grace', 10.00, 10.00, TRUE, TRUE),
('Time Management', 'Proper use of allocated time', 10.00, 10.00, TRUE, TRUE);

-- Insert default admin user (password: admin123 - should be changed)
INSERT INTO users (username, password_hash, email, role, full_name, is_active) VALUES
('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGdjGj/n3.B8kkWHhLx9Zy6/sO.e', 'admin@mallakhamb.com', 'admin', 'System Administrator', TRUE);

-- =====================================================
-- VIEWS FOR REPORTING
-- =====================================================

-- View for competition standings
CREATE VIEW v_competition_standings AS
SELECT 
    c.id AS competition_id,
    c.competition_name,
    cc.category,
    ag.group_name AS age_group,
    t.team_name,
    CONCAT(p.first_name, ' ', p.last_name) AS player_name,
    fs.total_score,
    fs.average_score,
    fs.rank_position,
    fs.rank_status
FROM final_scores fs
JOIN competition_entries ce ON fs.competition_entry_id = ce.id
JOIN competition_categories cc ON ce.competition_category_id = cc.id
JOIN competitions c ON ce.competition_id = c.id
JOIN age_groups ag ON cc.age_group_id = ag.id
JOIN players p ON ce.player_id = p.id
JOIN teams t ON p.team_id = t.id
ORDER BY c.id, cc.id, fs.rank_position;

-- View for performance schedule
CREATE VIEW v_performance_schedule AS
SELECT 
    c.competition_name,
    cc.category,
    ag.group_name AS age_group,
    ps.sequence_number,
    t.team_name,
    CONCAT(p.first_name, ' ', p.last_name) AS player_name,
    ps.performance_status,
    ps.scheduled_time
FROM performance_sequences ps
JOIN lottery_draws ld ON ps.lottery_draw_id = ld.id
JOIN competition_entries ce ON ps.competition_entry_id = ce.id
JOIN competition_categories cc ON ld.competition_category_id = cc.id
JOIN competitions c ON ld.competition_id = c.id
JOIN age_groups ag ON cc.age_group_id = ag.id
JOIN players p ON ce.player_id = p.id
JOIN teams t ON p.team_id = t.id
ORDER BY c.id, cc.id, ps.sequence_number;
