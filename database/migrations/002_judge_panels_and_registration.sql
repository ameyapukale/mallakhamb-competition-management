-- Migration 002: judge panel positions and judge competition registration
--
-- 1. Rebuilds judge_panels. The table's InnoDB tablespace went missing, so every
--    query against it failed with "doesn't exist in engine" (this is what made
--    GET /api/judge-panels/my/panels return 500). panel_members and panel_scorers
--    were both empty, so nothing is lost by recreating it.
-- 2. Adds panel_members.position for the seven real panel slots
--    (Judge No. 1-5, Scorer, Time Keeper).
-- 3. Adds competition_judges so judges can register themselves for a competition.

USE mallakhamb_competition;

-- -----------------------------------------------------------------
-- 1. Rebuild the corrupt judge_panels table
-- -----------------------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS judge_panels;

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

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------
-- 2. Panel positions
-- -----------------------------------------------------------------
-- `role` is kept because score.routes.js still selects it; `position` is the
-- field the panel builder writes and reads.
ALTER TABLE panel_members
    ADD COLUMN position ENUM(
        'judge_1', 'judge_2', 'judge_3', 'judge_4', 'judge_5',
        'scorer', 'time_keeper'
    ) NOT NULL DEFAULT 'judge_1' AFTER judge_id,
    ADD UNIQUE KEY unique_panel_position (panel_id, position);

-- unique_panel_judge (panel_id, judge_id) already exists and is what stops one
-- person from holding two positions on the same panel.

-- -----------------------------------------------------------------
-- 3. Judge registration for a competition
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS competition_judges (
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
