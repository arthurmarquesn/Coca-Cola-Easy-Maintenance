-- =========================================================
-- COCA-COLA EASY MAINTENANCE
-- BANCO DE DADOS UNIFICADO -- MySQL 8.x
--
-- Arquivo único e completo. Substitui e consolida:
--   - database/schema.sql                      (base)
--   - migrations/001_remove_admin_role.sql
--   - migrations/20260917_01_equipment_criticality.sql
--   - migrations/20260920_create_masp_module.sql
--   - migrations/20261002_login_attempts.sql
--   - migrations/20261004_analytics_indexes.sql
--
-- 29 tabelas, criadas em ordem de dependência (as FKs são
-- válidas mesmo com FOREIGN_KEY_CHECKS ligado).
--
-- Idempotente: usa CREATE ... IF NOT EXISTS e não apaga
-- nada. Para recriar o banco do zero, descomente o bloco
-- RESET abaixo -- ele APAGA TODOS OS DADOS.
-- =========================================================

SET @OLD_SQL_MODE=@@SQL_MODE;
SET SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';


-- =========================================================
-- 0. RESET (OPCIONAL)
-- ATENÇÃO: APAGA TODOS OS DADOS EXISTENTES.
-- Descomente as duas linhas apenas se for esse o objetivo.
-- =========================================================

-- DROP DATABASE IF EXISTS coca_cola_maintenance;


-- =========================================================
-- 1. CRIAÇÃO DO BANCO
-- =========================================================

CREATE DATABASE IF NOT EXISTS coca_cola_maintenance
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE coca_cola_maintenance;


-- =========================================================
-- 2. UNIDADES, USUÁRIOS E VÍNCULOS
-- =========================================================

-- -----------------------------------------------------
-- Tabela `units`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`units` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(20) NOT NULL,
  `sap_code` VARCHAR(50) NULL DEFAULT NULL,
  `name` VARCHAR(150) NOT NULL,
  `city` VARCHAR(100) NULL DEFAULT NULL,
  `state` VARCHAR(100) NULL DEFAULT NULL,
  `country` VARCHAR(100) NOT NULL DEFAULT 'Brasil',
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_units_code` (`code` ASC) VISIBLE,
  UNIQUE INDEX `uq_units_sap_code` (`sap_code` ASC) VISIBLE,
  INDEX `idx_units_active` (`active` ASC) VISIBLE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `login_attempts`
-- Contador de tentativas de login (por conta e, com
-- LOGIN_TRUSTED_IP_HEADER, por IP). Chaves são hashes.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`login_attempts` (
  `account_key` CHAR(64) NOT NULL PRIMARY KEY,
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  INDEX `idx_login_attempts_expiry` (`expires_at`)
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Tabela `users`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('MAINTENANCE', 'MANAGER') NOT NULL DEFAULT 'MANAGER',
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `last_login_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_users_email` (`email` ASC) VISIBLE,
  INDEX `idx_users_unit_id` (`unit_id` ASC) VISIBLE,
  INDEX `idx_users_role` (`role` ASC) VISIBLE,
  INDEX `idx_users_active` (`active` ASC) VISIBLE,
  CONSTRAINT `fk_users_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `user_units`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`user_units` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT '0',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_user_units` (`user_id` ASC, `unit_id` ASC) VISIBLE,
  INDEX `idx_user_units_user` (`user_id` ASC) VISIBLE,
  INDEX `idx_user_units_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_user_units_default` (`is_default` ASC) VISIBLE,
  CONSTRAINT `fk_user_units_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_user_units_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 3. IMPORTAÇÕES E LINHAS BRUTAS
-- =========================================================

-- -----------------------------------------------------
-- Tabela `imports`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`imports` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `original_file_name` VARCHAR(255) NULL DEFAULT NULL,
  `file_hash` VARCHAR(128) NULL DEFAULT NULL,
  `source_system` VARCHAR(80) NOT NULL DEFAULT 'SAP',
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
  `total_rows` INT UNSIGNED NOT NULL DEFAULT '0',
  `processed_rows` INT UNSIGNED NOT NULL DEFAULT '0',
  `error_rows` INT UNSIGNED NOT NULL DEFAULT '0',
  `error_message` TEXT NULL DEFAULT NULL,
  `imported_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_imports_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_imports_status` (`status` ASC) VISIBLE,
  INDEX `idx_imports_file_hash` (`file_hash` ASC) VISIBLE,
  INDEX `idx_imports_created_at` (`created_at` ASC) VISIBLE,
  CONSTRAINT `fk_imports_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 4. LINHAS DE PRODUÇÃO, EQUIPAMENTOS E MATERIAIS
-- =========================================================

-- -----------------------------------------------------
-- Tabela `production_lines`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`production_lines` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_production_line` (`unit_id` ASC, `code` ASC) VISIBLE,
  INDEX `idx_production_lines_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_production_lines_active` (`active` ASC) VISIBLE,
  CONSTRAINT `fk_production_lines_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `equipments`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`equipments` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `production_line_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `criticality` ENUM('A', 'B', 'C') NULL DEFAULT NULL,
  `criticality_justification` TEXT NULL DEFAULT NULL,
  `criticality_updated_by` BIGINT UNSIGNED NULL DEFAULT NULL,
  `criticality_updated_at` DATETIME NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_equipment` (`unit_id` ASC, `code` ASC) VISIBLE,
  INDEX `idx_equipments_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_equipments_line` (`production_line_id` ASC) VISIBLE,
  INDEX `idx_equipments_active` (`active` ASC) VISIBLE,
  INDEX `idx_equipments_criticality` (`criticality` ASC) VISIBLE,
  INDEX `idx_equipments_criticality_updated_by` (`criticality_updated_by` ASC) VISIBLE,
  CONSTRAINT `fk_equipments_criticality_updated_by`
    FOREIGN KEY (`criticality_updated_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_equipments_line`
    FOREIGN KEY (`production_line_id`)
    REFERENCES `coca_cola_maintenance`.`production_lines` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_equipments_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `equipment_aliases`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`equipment_aliases` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `equipment_id` BIGINT UNSIGNED NOT NULL,
  `alias` VARCHAR(255) NOT NULL,
  `normalized_alias` VARCHAR(255) NULL DEFAULT NULL,
  `source_system` VARCHAR(80) NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_equipment_alias` (`equipment_id` ASC, `alias` ASC) VISIBLE,
  INDEX `idx_equipment_alias_equipment` (`equipment_id` ASC) VISIBLE,
  INDEX `idx_equipment_alias_normalized` (`normalized_alias` ASC) VISIBLE,
  CONSTRAINT `fk_equipment_alias_equipment`
    FOREIGN KEY (`equipment_id`)
    REFERENCES `coca_cola_maintenance`.`equipments` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `equipment_criticality_matrix`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`equipment_criticality_matrix` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `last_import_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `plant_name` VARCHAR(150) NOT NULL,
  `technical_location` VARCHAR(255) NULL DEFAULT NULL,
  `parent_equipment` VARCHAR(255) NULL DEFAULT NULL,
  `tag` VARCHAR(100) NOT NULL,
  `equipment_name` VARCHAR(255) NOT NULL,
  `normalized_equipment_name` VARCHAR(255) NOT NULL,
  `criticality` ENUM('A', 'B', 'C') NOT NULL,
  `source_sheet` VARCHAR(100) NOT NULL DEFAULT 'Criticidade ABC',
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_equipment_criticality_matrix_unit_tag` (`unit_id` ASC, `tag` ASC) VISIBLE,
  INDEX `idx_equipment_criticality_matrix_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_equipment_criticality_matrix_criticality` (`unit_id` ASC, `criticality` ASC) VISIBLE,
  INDEX `idx_equipment_criticality_matrix_name` (`unit_id` ASC, `normalized_equipment_name` ASC) VISIBLE,
  INDEX `idx_equipment_criticality_matrix_active` (`unit_id` ASC, `active` ASC) VISIBLE,
  INDEX `idx_equipment_criticality_matrix_import` (`last_import_id` ASC) VISIBLE,
  CONSTRAINT `fk_equipment_criticality_matrix_import`
    FOREIGN KEY (`last_import_id`)
    REFERENCES `coca_cola_maintenance`.`imports` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_criticality_matrix_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `materials`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`materials` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_material` (`unit_id` ASC, `code` ASC) VISIBLE,
  INDEX `idx_materials_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_materials_active` (`active` ASC) VISIBLE,
  CONSTRAINT `fk_materials_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `raw_import_rows`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`raw_import_rows` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `import_id` BIGINT UNSIGNED NOT NULL,
  `source_row_number` INT UNSIGNED NOT NULL,
  `sheet_name` VARCHAR(150) NULL DEFAULT NULL,
  `row_hash` VARCHAR(128) NULL DEFAULT NULL,
  `raw_data` JSON NOT NULL,
  `processed` TINYINT(1) NOT NULL DEFAULT '0',
  `error_message` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_raw_import_row` (`import_id` ASC, `source_row_number` ASC) VISIBLE,
  INDEX `idx_raw_import_rows_import` (`import_id` ASC) VISIBLE,
  INDEX `idx_raw_import_rows_hash` (`row_hash` ASC) VISIBLE,
  INDEX `idx_raw_import_rows_processed` (`processed` ASC) VISIBLE,
  CONSTRAINT `fk_raw_import_rows_import`
    FOREIGN KEY (`import_id`)
    REFERENCES `coca_cola_maintenance`.`imports` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 5. TAXONOMIA DE FALHAS
-- =========================================================

-- -----------------------------------------------------
-- Tabela `failure_categories`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`failure_categories` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_failure_categories_name` (`name` ASC) VISIBLE,
  INDEX `idx_failure_categories_active` (`active` ASC) VISIBLE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `failure_systems`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`failure_systems` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_failure_system` (`category_id` ASC, `name` ASC) VISIBLE,
  INDEX `idx_failure_system_category` (`category_id` ASC) VISIBLE,
  INDEX `idx_failure_system_active` (`active` ASC) VISIBLE,
  CONSTRAINT `fk_failure_systems_category`
    FOREIGN KEY (`category_id`)
    REFERENCES `coca_cola_maintenance`.`failure_categories` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `failure_modes`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`failure_modes` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `system_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `code` VARCHAR(120) NULL DEFAULT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT '1',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_failure_mode` (`system_id` ASC, `name` ASC) VISIBLE,
  INDEX `idx_failure_modes_system` (`system_id` ASC) VISIBLE,
  INDEX `idx_failure_modes_code` (`code` ASC) VISIBLE,
  INDEX `idx_failure_modes_active` (`active` ASC) VISIBLE,
  CONSTRAINT `fk_failure_modes_system`
    FOREIGN KEY (`system_id`)
    REFERENCES `coca_cola_maintenance`.`failure_systems` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 6. EVENTOS DE MANUTENÇÃO
-- =========================================================

-- -----------------------------------------------------
-- Tabela `maintenance_events`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`maintenance_events` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `import_id` BIGINT UNSIGNED NOT NULL,
  `raw_row_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `production_line_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `equipment_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `material_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `source_system` VARCHAR(80) NULL DEFAULT NULL,
  `source_order_number` VARCHAR(120) NULL DEFAULT NULL,
  `maintenance_order_number` VARCHAR(120) NULL DEFAULT NULL,
  `event_date` DATE NOT NULL,
  `shift` VARCHAR(80) NULL DEFAULT NULL,
  `interval_label` VARCHAR(120) NULL DEFAULT NULL,
  `interval_start` TIME NULL DEFAULT NULL,
  `interval_end` TIME NULL DEFAULT NULL,
  `source_line_name` VARCHAR(180) NULL DEFAULT NULL,
  `source_stop_type` VARCHAR(180) NULL DEFAULT NULL,
  `source_material_code` VARCHAR(120) NULL DEFAULT NULL,
  `source_material_description` VARCHAR(255) NULL DEFAULT NULL,
  `source_equipment_name` VARCHAR(255) NULL DEFAULT NULL,
  `source_stop_subkey` VARCHAR(255) NULL DEFAULT NULL,
  `source_stop_key_1` VARCHAR(255) NULL DEFAULT NULL,
  `observation` TEXT NULL DEFAULT NULL,
  `normalized_description` TEXT NULL DEFAULT NULL,
  `started_at` DATETIME NULL DEFAULT NULL,
  `ended_at` DATETIME NULL DEFAULT NULL,
  `process_efficiency_loss` DECIMAL(16,8) NULL DEFAULT NULL,
  `accumulated_points` DECIMAL(18,8) NULL DEFAULT NULL,
  `produced_cases` DECIMAL(16,2) NULL DEFAULT NULL,
  `total_minutes` DECIMAL(12,2) NULL DEFAULT NULL,
  `downtime_minutes` DECIMAL(12,2) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_event_raw_row` (`raw_row_id` ASC) VISIBLE,
  INDEX `idx_events_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_events_import` (`import_id` ASC) VISIBLE,
  INDEX `idx_events_line` (`production_line_id` ASC) VISIBLE,
  INDEX `idx_events_equipment` (`equipment_id` ASC) VISIBLE,
  INDEX `idx_events_material` (`material_id` ASC) VISIBLE,
  INDEX `idx_events_date` (`event_date` ASC) VISIBLE,
  INDEX `idx_events_unit_date` (`unit_id` ASC, `event_date` ASC) VISIBLE,
  INDEX `idx_events_unit_import` (`unit_id` ASC, `import_id` ASC) VISIBLE,
  INDEX `idx_events_shift` (`shift` ASC) VISIBLE,
  INDEX `idx_events_stop_type` (`source_stop_type` ASC) VISIBLE,
  INDEX `idx_events_source_order` (`source_order_number` ASC) VISIBLE,
  INDEX `idx_events_maintenance_order` (`maintenance_order_number` ASC) VISIBLE,
  INDEX `idx_events_source_line_name` (`source_line_name` ASC) VISIBLE,
  INDEX `idx_events_source_equipment_name` (`source_equipment_name` ASC) VISIBLE,
  INDEX `idx_events_downtime` (`downtime_minutes` ASC) VISIBLE,
  CONSTRAINT `chk_events_efficiency_loss`
    CHECK (`process_efficiency_loss` IS NULL OR `process_efficiency_loss` >= 0),
  CONSTRAINT `chk_events_produced_cases`
    CHECK (`produced_cases` IS NULL OR `produced_cases` >= 0),
  CONSTRAINT `chk_events_total_minutes`
    CHECK (`total_minutes` IS NULL OR `total_minutes` >= 0),
  CONSTRAINT `chk_events_downtime`
    CHECK (`downtime_minutes` IS NULL OR `downtime_minutes` >= 0),
  CONSTRAINT `fk_events_equipment`
    FOREIGN KEY (`equipment_id`)
    REFERENCES `coca_cola_maintenance`.`equipments` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_events_import`
    FOREIGN KEY (`import_id`)
    REFERENCES `coca_cola_maintenance`.`imports` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_events_material`
    FOREIGN KEY (`material_id`)
    REFERENCES `coca_cola_maintenance`.`materials` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_events_production_line`
    FOREIGN KEY (`production_line_id`)
    REFERENCES `coca_cola_maintenance`.`production_lines` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_events_raw_row`
    FOREIGN KEY (`raw_row_id`)
    REFERENCES `coca_cola_maintenance`.`raw_import_rows` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_events_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 7. CLASSIFICAÇÃO, AUDITORIA E SUGESTÕES (ML)
-- =========================================================

-- -----------------------------------------------------
-- Tabela `event_classifications`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`event_classifications` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `category_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `system_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `mode_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `failure_origin` ENUM('MANUTENCAO', 'OPERACAO') NULL DEFAULT NULL,
  `failure_origin_source` ENUM('ML', 'MANUAL') NULL DEFAULT NULL,
  `classified_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `source` ENUM('IMPORTADO', 'IA', 'REGRA', 'MANUAL') NOT NULL,
  `confidence` DECIMAL(7,6) NULL DEFAULT NULL,
  `status` ENUM('PENDENTE_REVISAO', 'APROVADA', 'CORRIGIDA') NOT NULL DEFAULT 'PENDENTE_REVISAO',
  `classification_notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_event_classification` (`event_id` ASC) VISIBLE,
  INDEX `idx_classification_category` (`category_id` ASC) VISIBLE,
  INDEX `idx_classification_system` (`system_id` ASC) VISIBLE,
  INDEX `idx_classification_mode` (`mode_id` ASC) VISIBLE,
  INDEX `idx_classification_status` (`status` ASC) VISIBLE,
  INDEX `idx_classification_source` (`source` ASC) VISIBLE,
  INDEX `idx_classification_user` (`classified_by_user_id` ASC) VISIBLE,
  CONSTRAINT `chk_classification_confidence`
    CHECK (`confidence` IS NULL OR (`confidence` >= 0 AND `confidence` <= 1)),
  CONSTRAINT `fk_classification_category`
    FOREIGN KEY (`category_id`)
    REFERENCES `coca_cola_maintenance`.`failure_categories` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_classification_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_classification_mode`
    FOREIGN KEY (`mode_id`)
    REFERENCES `coca_cola_maintenance`.`failure_modes` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_classification_system`
    FOREIGN KEY (`system_id`)
    REFERENCES `coca_cola_maintenance`.`failure_systems` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_classification_user`
    FOREIGN KEY (`classified_by_user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `classification_audit`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`classification_audit` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `classification_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `previous_category_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `new_category_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `previous_failure_system_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `new_failure_system_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `previous_failure_mode_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `new_failure_mode_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `action` ENUM('CRIACAO', 'APROVACAO', 'CORRECAO') NOT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_classification` (`classification_id` ASC) VISIBLE,
  INDEX `idx_audit_user` (`user_id` ASC) VISIBLE,
  INDEX `idx_audit_created_at` (`created_at` ASC) VISIBLE,
  INDEX `fk_audit_previous_category` (`previous_category_id` ASC) VISIBLE,
  INDEX `fk_audit_new_category` (`new_category_id` ASC) VISIBLE,
  INDEX `fk_audit_previous_system` (`previous_failure_system_id` ASC) VISIBLE,
  INDEX `fk_audit_new_system` (`new_failure_system_id` ASC) VISIBLE,
  INDEX `fk_audit_previous_mode` (`previous_failure_mode_id` ASC) VISIBLE,
  INDEX `fk_audit_new_mode` (`new_failure_mode_id` ASC) VISIBLE,
  CONSTRAINT `fk_audit_classification`
    FOREIGN KEY (`classification_id`)
    REFERENCES `coca_cola_maintenance`.`event_classifications` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_new_category`
    FOREIGN KEY (`new_category_id`)
    REFERENCES `coca_cola_maintenance`.`failure_categories` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_new_mode`
    FOREIGN KEY (`new_failure_mode_id`)
    REFERENCES `coca_cola_maintenance`.`failure_modes` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_new_system`
    FOREIGN KEY (`new_failure_system_id`)
    REFERENCES `coca_cola_maintenance`.`failure_systems` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_previous_category`
    FOREIGN KEY (`previous_category_id`)
    REFERENCES `coca_cola_maintenance`.`failure_categories` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_previous_mode`
    FOREIGN KEY (`previous_failure_mode_id`)
    REFERENCES `coca_cola_maintenance`.`failure_modes` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_previous_system`
    FOREIGN KEY (`previous_failure_system_id`)
    REFERENCES `coca_cola_maintenance`.`failure_systems` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `classification_suggestions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`classification_suggestions` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `model_type` ENUM('ML') NOT NULL DEFAULT 'ML',
  `model_version` VARCHAR(100) NOT NULL,
  `failed_component_code` VARCHAR(100) NOT NULL,
  `failure_mode` VARCHAR(255) NOT NULL,
  `failure_origin` ENUM('MANUTENCAO', 'OPERACAO') NULL DEFAULT NULL,
  `failure_origin_confidence` DECIMAL(7,6) NULL DEFAULT NULL,
  `failure_origin_model_version` VARCHAR(100) NULL DEFAULT NULL,
  `confidence` DECIMAL(7,6) NULL DEFAULT NULL,
  `top_predictions` JSON NULL DEFAULT NULL,
  `decision_source` ENUM('ML', 'RULE') NULL DEFAULT NULL,
  `decision_margin` DECIMAL(14,8) NULL DEFAULT NULL,
  `automation_threshold` DECIMAL(14,8) NULL DEFAULT NULL,
  `automation_status` ENUM('HIGH_CONFIDENCE', 'REVIEW_REQUIRED', 'RULE_HIGH_CONFIDENCE') NULL DEFAULT NULL,
  `confidence_type` VARCHAR(100) NULL DEFAULT NULL,
  `status` ENUM('PENDENTE_REVISAO', 'CONFIRMADA', 'CORRIGIDA', 'DESCARTADA') NOT NULL DEFAULT 'PENDENTE_REVISAO',
  `reviewed_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_classification_suggestion_event_model` (`event_id` ASC, `model_type` ASC, `model_version` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_event` (`event_id` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_event_model_status` (`event_id` ASC, `model_type` ASC, `status` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_status` (`status` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_component` (`failed_component_code` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_confidence` (`confidence` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_reviewed_by` (`reviewed_by_user_id` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_decision_source` (`decision_source` ASC) VISIBLE,
  INDEX `idx_classification_suggestions_automation_status` (`automation_status` ASC) VISIBLE,
  CONSTRAINT `fk_classification_suggestions_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_classification_suggestions_reviewed_by`
    FOREIGN KEY (`reviewed_by_user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 8. ORIGEM DA FALHA (MANUTENÇÃO x OPERAÇÃO)
-- =========================================================

-- -----------------------------------------------------
-- Tabela `event_failure_origin_predictions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`event_failure_origin_predictions` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `failure_origin` ENUM('MANUTENCAO', 'OPERACAO') NOT NULL,
  `confidence` DECIMAL(7,6) NOT NULL,
  `confidence_level` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
  `model_version` VARCHAR(120) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_event_origin_model` (`event_id` ASC, `model_version` ASC) VISIBLE,
  INDEX `idx_origin_event` (`event_id` ASC) VISIBLE,
  INDEX `idx_origin_class` (`failure_origin` ASC) VISIBLE,
  INDEX `idx_origin_confidence_level` (`confidence_level` ASC) VISIBLE,
  CONSTRAINT `fk_origin_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `event_failure_origin_reviews`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`event_failure_origin_reviews` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `manual_origin` ENUM('OPERACAO', 'MANUTENCAO') NOT NULL,
  `reviewed_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `review_note` VARCHAR(500) NULL DEFAULT NULL,
  `reviewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uq_failure_origin_review_event` (`event_id` ASC) VISIBLE,
  INDEX `idx_failure_origin_review_origin` (`manual_origin` ASC) VISIBLE,
  INDEX `idx_failure_origin_review_user` (`reviewed_by_user_id` ASC) VISIBLE,
  INDEX `idx_failure_origin_review_date` (`reviewed_at` ASC) VISIBLE,
  CONSTRAINT `fk_failure_origin_review_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_failure_origin_review_user`
    FOREIGN KEY (`reviewed_by_user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `event_failure_origin_review_audit`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`event_failure_origin_review_audit` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `previous_origin` ENUM('OPERACAO', 'MANUTENCAO') NULL DEFAULT NULL,
  `new_origin` ENUM('OPERACAO', 'MANUTENCAO') NULL DEFAULT NULL,
  `action` ENUM('CRIACAO', 'ALTERACAO', 'REMOCAO') NOT NULL,
  `notes` VARCHAR(500) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_failure_origin_audit_event` (`event_id` ASC) VISIBLE,
  INDEX `idx_failure_origin_audit_user` (`user_id` ASC) VISIBLE,
  INDEX `idx_failure_origin_audit_date` (`created_at` ASC) VISIBLE,
  CONSTRAINT `fk_failure_origin_audit_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_failure_origin_audit_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- =========================================================
-- 9. MÓDULO MASP
-- =========================================================

-- -----------------------------------------------------
-- Tabela `masp_analyses`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_analyses` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unit_id` BIGINT UNSIGNED NOT NULL,
  `production_line_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `equipment_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `owner_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `title` VARCHAR(180) NOT NULL,
  `problem_statement` TEXT NOT NULL,
  `status` ENUM('DRAFT', 'ANALYSIS', 'ROOT_CAUSE', 'ACTION_PLAN', 'EXECUTION', 'VERIFICATION', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `scope_start_date` DATE NULL DEFAULT NULL,
  `scope_end_date` DATE NULL DEFAULT NULL,
  `recurrence_component_code` VARCHAR(120) NULL DEFAULT NULL,
  `recurrence_failure_mode` VARCHAR(255) NULL DEFAULT NULL,
  `recurrence_failure_origin` ENUM('MANUTENCAO', 'OPERACAO') NULL DEFAULT NULL,
  `verification_days` SMALLINT UNSIGNED NOT NULL DEFAULT '30',
  `closed_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_analyses_unit` (`unit_id` ASC) VISIBLE,
  INDEX `idx_masp_analyses_equipment` (`equipment_id` ASC) VISIBLE,
  INDEX `idx_masp_analyses_line` (`production_line_id` ASC) VISIBLE,
  INDEX `idx_masp_analyses_status` (`status` ASC) VISIBLE,
  INDEX `idx_masp_analyses_created_at` (`created_at` ASC) VISIBLE,
  INDEX `idx_masp_analyses_owner` (`owner_user_id` ASC) VISIBLE,
  INDEX `fk_masp_analyses_created_by` (`created_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_analyses_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_analyses_equipment`
    FOREIGN KEY (`equipment_id`)
    REFERENCES `coca_cola_maintenance`.`equipments` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_analyses_line`
    FOREIGN KEY (`production_line_id`)
    REFERENCES `coca_cola_maintenance`.`production_lines` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_analyses_owner`
    FOREIGN KEY (`owner_user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_analyses_unit`
    FOREIGN KEY (`unit_id`)
    REFERENCES `coca_cola_maintenance`.`units` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_events`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_events` (

  `masp_id` BIGINT UNSIGNED NOT NULL,
  `event_id` BIGINT UNSIGNED NOT NULL,
  `relation_type` ENUM('SOURCE', 'EVIDENCE', 'RECURRENCE') NOT NULL DEFAULT 'SOURCE',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`masp_id`, `event_id`),
  INDEX `idx_masp_events_event` (`event_id` ASC) VISIBLE,
  INDEX `idx_masp_events_relation` (`relation_type` ASC) VISIBLE,
  CONSTRAINT `fk_masp_events_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_events_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_hypotheses`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_hypotheses` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `masp_id` BIGINT UNSIGNED NOT NULL,
  `category` ENUM('MAQUINA', 'METODO', 'MAO_DE_OBRA', 'MATERIAL', 'MEDICAO', 'MEIO_AMBIENTE') NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('OPEN', 'PROBABLE', 'DISCARDED', 'CONFIRMED') NOT NULL DEFAULT 'OPEN',
  `source` ENUM('ANALYST', 'HISTORY', 'RULE') NOT NULL DEFAULT 'ANALYST',
  `support_count` INT UNSIGNED NOT NULL DEFAULT '0',
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_hypotheses_masp` (`masp_id` ASC) VISIBLE,
  INDEX `idx_masp_hypotheses_category` (`category` ASC) VISIBLE,
  INDEX `idx_masp_hypotheses_status` (`status` ASC) VISIBLE,
  INDEX `fk_masp_hypotheses_created_by` (`created_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_hypotheses_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_hypotheses_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_five_whys`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_five_whys` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `masp_id` BIGINT UNSIGNED NOT NULL,
  `parent_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `depth` TINYINT UNSIGNED NOT NULL DEFAULT '1',
  `answer` TEXT NOT NULL,
  `status` ENUM('ACTIVE', 'DISCARDED') NOT NULL DEFAULT 'ACTIVE',
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_five_whys_masp` (`masp_id` ASC) VISIBLE,
  INDEX `idx_masp_five_whys_parent` (`parent_id` ASC) VISIBLE,
  INDEX `idx_masp_five_whys_status` (`status` ASC) VISIBLE,
  INDEX `fk_masp_five_whys_created_by` (`created_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_five_whys_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_five_whys_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_five_whys_parent`
    FOREIGN KEY (`parent_id`)
    REFERENCES `coca_cola_maintenance`.`masp_five_whys` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_root_causes`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_root_causes` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `masp_id` BIGINT UNSIGNED NOT NULL,
  `hypothesis_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `five_why_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('PROPOSED', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'PROPOSED',
  `evidence_summary` TEXT NULL DEFAULT NULL,
  `confirmed_by` BIGINT UNSIGNED NULL DEFAULT NULL,
  `confirmed_at` DATETIME NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_root_causes_masp` (`masp_id` ASC) VISIBLE,
  INDEX `idx_masp_root_causes_hypothesis` (`hypothesis_id` ASC) VISIBLE,
  INDEX `idx_masp_root_causes_five_why` (`five_why_id` ASC) VISIBLE,
  INDEX `idx_masp_root_causes_status` (`status` ASC) VISIBLE,
  INDEX `fk_masp_root_causes_confirmed_by` (`confirmed_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_root_causes_confirmed_by`
    FOREIGN KEY (`confirmed_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_root_causes_five_why`
    FOREIGN KEY (`five_why_id`)
    REFERENCES `coca_cola_maintenance`.`masp_five_whys` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_root_causes_hypothesis`
    FOREIGN KEY (`hypothesis_id`)
    REFERENCES `coca_cola_maintenance`.`masp_hypotheses` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_root_causes_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_evidence`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_evidence` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `masp_id` BIGINT UNSIGNED NOT NULL,
  `hypothesis_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `five_why_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `event_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `type` ENUM('EVENT', 'TEXT', 'MEASUREMENT', 'DOCUMENT') NOT NULL,
  `description` TEXT NOT NULL,
  `attachment_path` VARCHAR(500) NULL DEFAULT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_evidence_masp` (`masp_id` ASC) VISIBLE,
  INDEX `idx_masp_evidence_hypothesis` (`hypothesis_id` ASC) VISIBLE,
  INDEX `idx_masp_evidence_five_why` (`five_why_id` ASC) VISIBLE,
  INDEX `idx_masp_evidence_event` (`event_id` ASC) VISIBLE,
  INDEX `fk_masp_evidence_created_by` (`created_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_evidence_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_evidence_event`
    FOREIGN KEY (`event_id`)
    REFERENCES `coca_cola_maintenance`.`maintenance_events` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_evidence_five_why`
    FOREIGN KEY (`five_why_id`)
    REFERENCES `coca_cola_maintenance`.`masp_five_whys` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_evidence_hypothesis`
    FOREIGN KEY (`hypothesis_id`)
    REFERENCES `coca_cola_maintenance`.`masp_hypotheses` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_evidence_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_actions`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_actions` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `masp_id` BIGINT UNSIGNED NOT NULL,
  `root_cause_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `what` TEXT NOT NULL,
  `why` TEXT NULL DEFAULT NULL,
  `where_text` VARCHAR(255) NULL DEFAULT NULL,
  `when_date` DATE NULL DEFAULT NULL,
  `who_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `who_text` VARCHAR(180) NULL DEFAULT NULL,
  `how_text` TEXT NULL DEFAULT NULL,
  `how_much_text` VARCHAR(255) NULL DEFAULT NULL,
  `status` ENUM('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `completed_at` DATETIME NULL DEFAULT NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_actions_masp` (`masp_id` ASC) VISIBLE,
  INDEX `idx_masp_actions_root_cause` (`root_cause_id` ASC) VISIBLE,
  INDEX `idx_masp_actions_who` (`who_user_id` ASC) VISIBLE,
  INDEX `idx_masp_actions_status` (`status` ASC) VISIBLE,
  INDEX `idx_masp_actions_when` (`when_date` ASC) VISIBLE,
  INDEX `fk_masp_actions_created_by` (`created_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_actions_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_actions_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_actions_root_cause`
    FOREIGN KEY (`root_cause_id`)
    REFERENCES `coca_cola_maintenance`.`masp_root_causes` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_actions_who`
    FOREIGN KEY (`who_user_id`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Tabela `masp_verifications`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `coca_cola_maintenance`.`masp_verifications` (

  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `masp_id` BIGINT UNSIGNED NOT NULL,
  `baseline_start` DATE NULL DEFAULT NULL,
  `baseline_end` DATE NULL DEFAULT NULL,
  `verification_start` DATE NOT NULL,
  `verification_end` DATE NULL DEFAULT NULL,
  `event_count_before` INT UNSIGNED NULL DEFAULT NULL,
  `event_count_after` INT UNSIGNED NULL DEFAULT NULL,
  `downtime_before_minutes` DECIMAL(12,2) NULL DEFAULT NULL,
  `downtime_after_minutes` DECIMAL(12,2) NULL DEFAULT NULL,
  `recurrence_detected` TINYINT(1) NOT NULL DEFAULT '0',
  `notes` TEXT NULL DEFAULT NULL,
  `verified_by` BIGINT UNSIGNED NOT NULL,
  `verified_at` DATETIME NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_masp_verifications_masp` (`masp_id` ASC) VISIBLE,
  INDEX `idx_masp_verifications_period` (`verification_start` ASC, `verification_end` ASC) VISIBLE,
  INDEX `idx_masp_verifications_verified_by` (`verified_by` ASC) VISIBLE,
  CONSTRAINT `fk_masp_verifications_masp`
    FOREIGN KEY (`masp_id`)
    REFERENCES `coca_cola_maintenance`.`masp_analyses` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_masp_verifications_verified_by`
    FOREIGN KEY (`verified_by`)
    REFERENCES `coca_cola_maintenance`.`users` (`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- =========================================================
-- 10. DADOS INICIAIS
-- =========================================================

-- Unidades da Coca-Cola FEMSA: fonte única do cadastro.
-- code = código do centro (coluna "Centro" das planilhas),
-- sap_code = código SAP. A aplicação lê as unidades desta
-- tabela; não mantenha outra lista no código.
-- Reexecutar atualiza nome e código SAP pelo código do
-- centro e preserva cidade, estado e vínculos existentes.

INSERT INTO units (code, sap_code, name)
VALUES
    ('BAAD', 'BR1103',    'JUNDIAÍ'),
    ('BAAE', 'BR1104',    'MOGI'),
    ('BAAF', 'BR1102',    'CAMPO GRANDE'),
    ('BAAG', 'BR1106',    'ITABIRITO'),
    ('BAAI', 'BR1108',    'CURITIBA'),
    ('BAAJ', 'BR1109',    'MARINGÁ'),
    ('BAAK', 'BR1110',    'MARILIA'),
    ('B0AC', 'BR1111',    'BAURU'),
    ('BAAL', 'BR1112',    'ANTONIO CARLOS'),
    ('BAAO', 'BR1120',    'PORTO ALEGRE'),
    ('BAAR', 'BR1123',    'SANTA MARIA'),
    ('B2BH', 'BR1126-MI', 'ANTONIO PRADO')
AS new_unit
ON DUPLICATE KEY UPDATE
    sap_code = new_unit.sap_code,
    name     = new_unit.name;


-- Nenhum usuário é criado aqui: uma senha registrada neste
-- arquivo vale para todo banco montado a partir dele.
-- Crie o primeiro Analista com:
--
--   node --env-file=.env.local scripts/create-user.mjs \
--     "Nome" "nome@kof.com" "SENHA" "ANALISTA" "BAAK"


-- =========================================================
-- 11. VALIDAÇÃO
-- =========================================================

SELECT VERSION() AS mysql_version;

SELECT COUNT(*) AS total_tabelas
FROM information_schema.tables
WHERE table_schema = 'coca_cola_maintenance';

SELECT * FROM units;

SELECT role, COUNT(*) AS total FROM users GROUP BY role;


SET SQL_MODE=@OLD_SQL_MODE;
