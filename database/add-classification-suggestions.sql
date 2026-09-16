USE coca_cola_maintenance;


CREATE TABLE IF NOT EXISTS classification_suggestions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    event_id BIGINT UNSIGNED NOT NULL,

    model_type ENUM(
        'ML'
    ) NOT NULL DEFAULT 'ML',

    model_version VARCHAR(100) NOT NULL,

    failed_component_code VARCHAR(100) NOT NULL,

    failure_mode VARCHAR(255) NOT NULL,

    confidence DECIMAL(7,6) NULL,

    top_predictions JSON NULL,

    status ENUM(
        'PENDENTE_REVISAO',
        'CONFIRMADA',
        'CORRIGIDA',
        'DESCARTADA'
    ) NOT NULL DEFAULT 'PENDENTE_REVISAO',

    reviewed_by_user_id BIGINT UNSIGNED NULL,

    reviewed_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_classification_suggestion_event_model (
        event_id,
        model_type,
        model_version
    ),

    KEY idx_classification_suggestions_event (
        event_id
    ),

    KEY idx_classification_suggestions_status (
        status
    ),

    KEY idx_classification_suggestions_component (
        failed_component_code
    ),

    KEY idx_classification_suggestions_confidence (
        confidence
    ),

    CONSTRAINT fk_classification_suggestions_event
        FOREIGN KEY (event_id)
        REFERENCES maintenance_events(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_classification_suggestions_reviewed_by
        FOREIGN KEY (reviewed_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);