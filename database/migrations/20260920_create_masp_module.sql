-- =========================================================
-- EASY MAINTENANCE
-- MIGRATION 2026-09-20
-- MODULO MASP LOCAL / OFFLINE
-- =========================================================

USE coca_cola_maintenance;


CREATE TABLE masp_analyses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    unit_id BIGINT UNSIGNED NOT NULL,
    production_line_id BIGINT UNSIGNED NULL,
    equipment_id BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    owner_user_id BIGINT UNSIGNED NULL,
    title VARCHAR(180) NOT NULL,
    problem_statement TEXT NOT NULL,
    status ENUM(
        'DRAFT',
        'ANALYSIS',
        'ROOT_CAUSE',
        'ACTION_PLAN',
        'EXECUTION',
        'VERIFICATION',
        'CLOSED',
        'CANCELLED'
    ) NOT NULL DEFAULT 'DRAFT',
    scope_start_date DATE NULL,
    scope_end_date DATE NULL,
    recurrence_component_code VARCHAR(120) NULL,
    recurrence_failure_mode VARCHAR(255) NULL,
    recurrence_failure_origin ENUM(
        'MANUTENCAO',
        'OPERACAO'
    ) NULL,
    verification_days SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    closed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_analyses_unit (unit_id),
    KEY idx_masp_analyses_equipment (equipment_id),
    KEY idx_masp_analyses_line (production_line_id),
    KEY idx_masp_analyses_status (status),
    KEY idx_masp_analyses_created_at (created_at),
    KEY idx_masp_analyses_owner (owner_user_id),

    CONSTRAINT fk_masp_analyses_unit
        FOREIGN KEY (unit_id)
        REFERENCES units(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_masp_analyses_line
        FOREIGN KEY (production_line_id)
        REFERENCES production_lines(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_analyses_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES equipments(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_analyses_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_masp_analyses_owner
        FOREIGN KEY (owner_user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_events (
    masp_id BIGINT UNSIGNED NOT NULL,
    event_id BIGINT UNSIGNED NOT NULL,
    relation_type ENUM(
        'SOURCE',
        'EVIDENCE',
        'RECURRENCE'
    ) NOT NULL DEFAULT 'SOURCE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (masp_id, event_id),
    KEY idx_masp_events_event (event_id),
    KEY idx_masp_events_relation (relation_type),

    CONSTRAINT fk_masp_events_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_events_event
        FOREIGN KEY (event_id)
        REFERENCES maintenance_events(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_hypotheses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    masp_id BIGINT UNSIGNED NOT NULL,
    category ENUM(
        'MAQUINA',
        'METODO',
        'MAO_DE_OBRA',
        'MATERIAL',
        'MEDICAO',
        'MEIO_AMBIENTE'
    ) NOT NULL,
    description TEXT NOT NULL,
    status ENUM(
        'OPEN',
        'PROBABLE',
        'DISCARDED',
        'CONFIRMED'
    ) NOT NULL DEFAULT 'OPEN',
    source ENUM(
        'ANALYST',
        'HISTORY',
        'RULE'
    ) NOT NULL DEFAULT 'ANALYST',
    support_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_hypotheses_masp (masp_id),
    KEY idx_masp_hypotheses_category (category),
    KEY idx_masp_hypotheses_status (status),

    CONSTRAINT fk_masp_hypotheses_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_hypotheses_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_five_whys (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    masp_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    depth TINYINT UNSIGNED NOT NULL DEFAULT 1,
    answer TEXT NOT NULL,
    status ENUM(
        'ACTIVE',
        'DISCARDED'
    ) NOT NULL DEFAULT 'ACTIVE',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_five_whys_masp (masp_id),
    KEY idx_masp_five_whys_parent (parent_id),
    KEY idx_masp_five_whys_status (status),

    CONSTRAINT fk_masp_five_whys_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_five_whys_parent
        FOREIGN KEY (parent_id)
        REFERENCES masp_five_whys(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_five_whys_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_root_causes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    masp_id BIGINT UNSIGNED NOT NULL,
    hypothesis_id BIGINT UNSIGNED NULL,
    five_why_id BIGINT UNSIGNED NULL,
    description TEXT NOT NULL,
    status ENUM(
        'PROPOSED',
        'CONFIRMED',
        'REJECTED'
    ) NOT NULL DEFAULT 'PROPOSED',
    evidence_summary TEXT NULL,
    confirmed_by BIGINT UNSIGNED NULL,
    confirmed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_root_causes_masp (masp_id),
    KEY idx_masp_root_causes_hypothesis (hypothesis_id),
    KEY idx_masp_root_causes_five_why (five_why_id),
    KEY idx_masp_root_causes_status (status),

    CONSTRAINT fk_masp_root_causes_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_root_causes_hypothesis
        FOREIGN KEY (hypothesis_id)
        REFERENCES masp_hypotheses(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_root_causes_five_why
        FOREIGN KEY (five_why_id)
        REFERENCES masp_five_whys(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_root_causes_confirmed_by
        FOREIGN KEY (confirmed_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_evidence (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    masp_id BIGINT UNSIGNED NOT NULL,
    hypothesis_id BIGINT UNSIGNED NULL,
    five_why_id BIGINT UNSIGNED NULL,
    event_id BIGINT UNSIGNED NULL,
    type ENUM(
        'EVENT',
        'TEXT',
        'MEASUREMENT',
        'DOCUMENT'
    ) NOT NULL,
    description TEXT NOT NULL,
    attachment_path VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_evidence_masp (masp_id),
    KEY idx_masp_evidence_hypothesis (hypothesis_id),
    KEY idx_masp_evidence_five_why (five_why_id),
    KEY idx_masp_evidence_event (event_id),

    CONSTRAINT fk_masp_evidence_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_evidence_hypothesis
        FOREIGN KEY (hypothesis_id)
        REFERENCES masp_hypotheses(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_evidence_five_why
        FOREIGN KEY (five_why_id)
        REFERENCES masp_five_whys(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_evidence_event
        FOREIGN KEY (event_id)
        REFERENCES maintenance_events(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_evidence_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    masp_id BIGINT UNSIGNED NOT NULL,
    root_cause_id BIGINT UNSIGNED NULL,
    what TEXT NOT NULL,
    why TEXT NULL,
    where_text VARCHAR(255) NULL,
    when_date DATE NULL,
    who_user_id BIGINT UNSIGNED NULL,
    who_text VARCHAR(180) NULL,
    how_text TEXT NULL,
    how_much_text VARCHAR(255) NULL,
    status ENUM(
        'PLANNED',
        'IN_PROGRESS',
        'DONE',
        'CANCELLED'
    ) NOT NULL DEFAULT 'PLANNED',
    completed_at DATETIME NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_actions_masp (masp_id),
    KEY idx_masp_actions_root_cause (root_cause_id),
    KEY idx_masp_actions_who (who_user_id),
    KEY idx_masp_actions_status (status),
    KEY idx_masp_actions_when (when_date),

    CONSTRAINT fk_masp_actions_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_actions_root_cause
        FOREIGN KEY (root_cause_id)
        REFERENCES masp_root_causes(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_actions_who
        FOREIGN KEY (who_user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_masp_actions_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE masp_verifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    masp_id BIGINT UNSIGNED NOT NULL,
    baseline_start DATE NULL,
    baseline_end DATE NULL,
    verification_start DATE NOT NULL,
    verification_end DATE NULL,
    event_count_before INT UNSIGNED NULL,
    event_count_after INT UNSIGNED NULL,
    downtime_before_minutes DECIMAL(12,2) NULL,
    downtime_after_minutes DECIMAL(12,2) NULL,
    recurrence_detected BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NULL,
    verified_by BIGINT UNSIGNED NOT NULL,
    verified_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_masp_verifications_masp (masp_id),
    KEY idx_masp_verifications_period (verification_start, verification_end),
    KEY idx_masp_verifications_verified_by (verified_by),

    CONSTRAINT fk_masp_verifications_masp
        FOREIGN KEY (masp_id)
        REFERENCES masp_analyses(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_masp_verifications_verified_by
        FOREIGN KEY (verified_by)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
