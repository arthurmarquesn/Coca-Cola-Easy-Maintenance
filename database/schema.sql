CREATE DATABASE IF NOT EXISTS coca_cola_maintenance
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE coca_cola_maintenance;

-- =========================================================
-- UNIDADES
-- =========================================================

CREATE TABLE IF NOT EXISTS units (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'Brasil',

    active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_units_code (code)
);

-- =========================================================
-- USUÁRIOS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    unit_id BIGINT UNSIGNED NOT NULL,

    name VARCHAR(150) NOT NULL,
    email VARCHAR(191) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM(
        'ADMIN',
        'MANAGER',
        'MAINTENANCE',
        'VIEWER'
    ) NOT NULL DEFAULT 'VIEWER',

    active BOOLEAN NOT NULL DEFAULT TRUE,

    last_login_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_users_email (email),

    KEY idx_users_unit_id (unit_id),
    KEY idx_users_active (active),

    CONSTRAINT fk_users_unit
        FOREIGN KEY (unit_id)
        REFERENCES units(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =========================================================
-- UNIDADE INICIAL
-- =========================================================

INSERT INTO units (
    code,
    name,
    city,
    state,
    country
)
VALUES (
    'BAAK',
    'Marília',
    'Marília',
    'São Paulo',
    'Brasil'
)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    city = VALUES(city),
    state = VALUES(state),
    country = VALUES(country);