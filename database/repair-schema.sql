USE coca_cola_maintenance;

/* =========================================================
   10. CATEGORIAS DE FALHA
========================================================= */

CREATE TABLE IF NOT EXISTS failure_categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    name VARCHAR(150) NOT NULL,

    description TEXT NULL,

    active BOOLEAN
        NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_failure_categories_name (
        name
    ),

    KEY idx_failure_categories_active (
        active
    )
);


/* =========================================================
   11. SISTEMAS DE FALHA
========================================================= */

CREATE TABLE IF NOT EXISTS failure_systems (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    category_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(180) NOT NULL,

    description TEXT NULL,

    active BOOLEAN
        NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_failure_system (
        category_id,
        name
    ),

    KEY idx_failure_system_category (
        category_id
    ),

    KEY idx_failure_system_active (
        active
    ),

    CONSTRAINT fk_failure_system_category
        FOREIGN KEY (category_id)
        REFERENCES failure_categories(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);


/* =========================================================
   12. MODOS DE FALHA
========================================================= */

CREATE TABLE IF NOT EXISTS failure_modes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    failure_system_id BIGINT UNSIGNED NOT NULL,

    code VARCHAR(120) NULL,

    name VARCHAR(200) NOT NULL,

    description TEXT NULL,

    active BOOLEAN
        NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_failure_mode (
        failure_system_id,
        name
    ),

    KEY idx_failure_modes_system (
        failure_system_id
    ),

    KEY idx_failure_modes_code (
        code
    ),

    KEY idx_failure_modes_active (
        active
    ),

    CONSTRAINT fk_failure_mode_system
        FOREIGN KEY (failure_system_id)
        REFERENCES failure_systems(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);


/* =========================================================
   13. EVENTOS DE MANUTENÇÃO
========================================================= */

CREATE TABLE IF NOT EXISTS maintenance_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    unit_id BIGINT UNSIGNED NOT NULL,

    import_id BIGINT UNSIGNED NULL,

    raw_row_id BIGINT UNSIGNED NULL,

    production_line_id BIGINT UNSIGNED NULL,

    equipment_id BIGINT UNSIGNED NULL,

    material_id BIGINT UNSIGNED NULL,

    source_system VARCHAR(50)
        NOT NULL DEFAULT 'SAP',

    source_order_number VARCHAR(120) NULL,

    maintenance_order_number VARCHAR(120) NULL,

    event_date DATE NULL,

    shift VARCHAR(50) NULL,

    interval_label VARCHAR(100) NULL,

    interval_start TIME NULL,

    interval_end TIME NULL,

    source_line_name VARCHAR(150) NULL,

    source_stop_type VARCHAR(150) NULL,

    source_material_code VARCHAR(100) NULL,

    source_material_description VARCHAR(255) NULL,

    source_equipment_name VARCHAR(255) NULL,

    source_stop_subkey VARCHAR(255) NULL,

    source_stop_key_1 VARCHAR(255) NULL,

    observation TEXT NULL,

    normalized_description TEXT NULL,

    started_at DATETIME NULL,

    ended_at DATETIME NULL,

    process_efficiency_loss DECIMAL(16,8) NULL,

    accumulated_points DECIMAL(18,8) NULL,

    produced_cases DECIMAL(16,2) NULL,

    total_minutes DECIMAL(12,2) NULL,

    downtime_minutes DECIMAL(12,2) NULL,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_event_raw_row (
        raw_row_id
    ),

    KEY idx_events_unit (
        unit_id
    ),

    KEY idx_events_import (
        import_id
    ),

    KEY idx_events_line (
        production_line_id
    ),

    KEY idx_events_equipment (
        equipment_id
    ),

    KEY idx_events_material (
        material_id
    ),

    KEY idx_events_date (
        event_date
    ),

    KEY idx_events_shift (
        shift
    ),

    KEY idx_events_stop_type (
        source_stop_type
    ),

    KEY idx_events_source_order (
        source_order_number
    ),

    KEY idx_events_maintenance_order (
        maintenance_order_number
    ),

    KEY idx_events_downtime (
        downtime_minutes
    ),

    CONSTRAINT chk_event_efficiency_loss
        CHECK (
            process_efficiency_loss IS NULL
            OR process_efficiency_loss >= 0
        ),

    CONSTRAINT chk_event_produced_cases
        CHECK (
            produced_cases IS NULL
            OR produced_cases >= 0
        ),

    CONSTRAINT chk_event_total_minutes
        CHECK (
            total_minutes IS NULL
            OR total_minutes >= 0
        ),

    CONSTRAINT chk_event_downtime
        CHECK (
            downtime_minutes IS NULL
            OR downtime_minutes >= 0
        ),

    CONSTRAINT fk_event_unit
        FOREIGN KEY (unit_id)
        REFERENCES units(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_event_import
        FOREIGN KEY (import_id)
        REFERENCES imports(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_event_raw_row
        FOREIGN KEY (raw_row_id)
        REFERENCES raw_import_rows(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_event_line
        FOREIGN KEY (production_line_id)
        REFERENCES production_lines(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_event_equipment
        FOREIGN KEY (equipment_id)
        REFERENCES equipments(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_event_material
        FOREIGN KEY (material_id)
        REFERENCES materials(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);


/* =========================================================
   14. CLASSIFICAÇÕES
========================================================= */

CREATE TABLE IF NOT EXISTS event_classifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    event_id BIGINT UNSIGNED NOT NULL,

    category_id BIGINT UNSIGNED NULL,

    failure_system_id BIGINT UNSIGNED NULL,

    failure_mode_id BIGINT UNSIGNED NULL,

    classified_by_user_id BIGINT UNSIGNED NULL,

    source ENUM(
        'IMPORTADO',
        'IA',
        'REGRA',
        'MANUAL'
    ) NOT NULL,

    confidence DECIMAL(5,4) NULL,

    status ENUM(
        'PENDENTE_REVISAO',
        'APROVADA',
        'CORRIGIDA'
    )
        NOT NULL DEFAULT 'PENDENTE_REVISAO',

    classification_notes TEXT NULL,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_event_classification (
        event_id
    ),

    KEY idx_classification_category (
        category_id
    ),

    KEY idx_classification_system (
        failure_system_id
    ),

    KEY idx_classification_mode (
        failure_mode_id
    ),

    KEY idx_classification_status (
        status
    ),

    KEY idx_classification_source (
        source
    ),

    KEY idx_classification_user (
        classified_by_user_id
    ),

    CONSTRAINT chk_classification_confidence
        CHECK (
            confidence IS NULL
            OR (
                confidence >= 0
                AND confidence <= 1
            )
        ),

    CONSTRAINT fk_classification_event
        FOREIGN KEY (event_id)
        REFERENCES maintenance_events(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_classification_category
        FOREIGN KEY (category_id)
        REFERENCES failure_categories(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_classification_system
        FOREIGN KEY (failure_system_id)
        REFERENCES failure_systems(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_classification_mode
        FOREIGN KEY (failure_mode_id)
        REFERENCES failure_modes(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_classification_user
        FOREIGN KEY (classified_by_user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);


/* =========================================================
   15. AUDITORIA DE CLASSIFICAÇÃO
========================================================= */

CREATE TABLE IF NOT EXISTS classification_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    classification_id BIGINT UNSIGNED NOT NULL,

    user_id BIGINT UNSIGNED NULL,

    previous_category_id BIGINT UNSIGNED NULL,

    new_category_id BIGINT UNSIGNED NULL,

    previous_failure_system_id BIGINT UNSIGNED NULL,

    new_failure_system_id BIGINT UNSIGNED NULL,

    previous_failure_mode_id BIGINT UNSIGNED NULL,

    new_failure_mode_id BIGINT UNSIGNED NULL,

    action ENUM(
        'CRIACAO',
        'APROVACAO',
        'CORRECAO'
    ) NOT NULL,

    notes TEXT NULL,

    created_at TIMESTAMP
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_audit_classification (
        classification_id
    ),

    KEY idx_audit_user (
        user_id
    ),

    KEY idx_audit_created (
        created_at
    ),

    CONSTRAINT fk_audit_classification
        FOREIGN KEY (classification_id)
        REFERENCES event_classifications(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT fk_audit_previous_category
        FOREIGN KEY (previous_category_id)
        REFERENCES failure_categories(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_new_category
        FOREIGN KEY (new_category_id)
        REFERENCES failure_categories(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_previous_system
        FOREIGN KEY (previous_failure_system_id)
        REFERENCES failure_systems(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_new_system
        FOREIGN KEY (new_failure_system_id)
        REFERENCES failure_systems(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_previous_mode
        FOREIGN KEY (previous_failure_mode_id)
        REFERENCES failure_modes(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_audit_new_mode
        FOREIGN KEY (new_failure_mode_id)
        REFERENCES failure_modes(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);


/* =========================================================
   VALIDAÇÃO
========================================================= */

SHOW TABLES;