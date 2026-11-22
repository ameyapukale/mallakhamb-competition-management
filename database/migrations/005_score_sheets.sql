-- Migration 005: गुणपत्रिका / score sheets
--
-- Models the printed score sheet directly: one sheet per team, per competition
-- category (discipline + age group), per set. Each row is one player with the
-- five judge columns, वेळ, गुण कपात, and the derived सरासरी / अंतिम गुण.
--
-- This is deliberately separate from the existing `scores` table, which stores a
-- score per judge PER CRITERION against a lottery performance sequence. The paper
-- sheet records a single score per judge per player and needs no lottery draw.

USE mallakhamb_competition;

CREATE TABLE IF NOT EXISTS score_sheets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    competition_id INT NOT NULL,
    competition_category_id INT NOT NULL,       -- carries discipline + age group
    team_id INT NOT NULL,
    panel_id INT NULL,                          -- judge panel that scored it
    set_type ENUM('compulsory', 'optional') NOT NULL DEFAULT 'compulsory', -- ऐच्छिक संच
    event_number VARCHAR(20) NULL,              -- स्पर्धा क्र. 1अ / 2 / 3
    team_points DECIMAL(8, 2) NULL,             -- संघिक गुण, recomputed on every save
    status ENUM('draft', 'submitted') NOT NULL DEFAULT 'draft',
    remarks TEXT,
    created_by INT,
    submitted_by INT,
    submitted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_category_id) REFERENCES competition_categories(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (panel_id) REFERENCES judge_panels(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL,
    -- One sheet per team per category per set
    UNIQUE KEY unique_sheet (competition_id, competition_category_id, team_id, set_type),
    INDEX idx_competition (competition_id)
);

-- One row of the sheet. average_score and final_score are derived on save and
-- stored so rankings and reports can read them without recomputing.
CREATE TABLE IF NOT EXISTS score_sheet_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    score_sheet_id INT NOT NULL,
    player_id INT NOT NULL,
    competition_entry_id INT NULL,              -- the entry this row was built from
    row_no INT NOT NULL,                        -- क्र.
    performance_time VARCHAR(10) NULL,          -- वेळ, as written on the sheet
    head_judge_score DECIMAL(5, 2) NULL,        -- प्रमुख पंच
    judge1_score DECIMAL(5, 2) NULL,            -- पंच क्र. 1
    judge2_score DECIMAL(5, 2) NULL,            -- पंच क्र. 2
    judge3_score DECIMAL(5, 2) NULL,            -- पंच क्र. 3
    judge4_score DECIMAL(5, 2) NULL,            -- पंच क्र. 4
    deduction DECIMAL(5, 2) NOT NULL DEFAULT 0.00,  -- गुण कपात
    average_score DECIMAL(6, 3) NULL,           -- सरासरी: drop highest + lowest, average the rest
    final_score DECIMAL(6, 3) NULL,             -- अंतिम गुण: सरासरी - गुण कपात, floored at 0
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (score_sheet_id) REFERENCES score_sheets(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
    FOREIGN KEY (competition_entry_id) REFERENCES competition_entries(id) ON DELETE SET NULL,
    UNIQUE KEY unique_sheet_player (score_sheet_id, player_id),
    INDEX idx_sheet_row (score_sheet_id, row_no)
);
