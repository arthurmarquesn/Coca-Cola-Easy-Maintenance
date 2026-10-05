-- =========================================================
-- CONTAS DE TESTE: ANALISTA E GESTOR
-- MySQL 8.x. Uso local/desenvolvimento: senhas conhecidas.
-- Execute depois de database/schema.sql.
-- Requer a unidade BAAK ativa; sua ausencia impede a insercao.
-- Reexecutar preserva contas existentes, inclusive senha,
-- papel e vinculos. As credenciais abaixo valem para contas novas.
-- Execute em uma unica conexao; em caso de erro, use ROLLBACK.
-- =========================================================

USE coca_cola_maintenance;

START TRANSACTION;

-- Analista de Teste: analista.teste@example.com / Analista@Teste2026!
INSERT INTO users (unit_id, name, email, password_hash, role, active)
SELECT
    (SELECT id FROM units WHERE code = 'BAAK' AND active = TRUE),
    'Analista de Teste',
    'analista.teste@example.com',
    '$2b$12$2Vku1sb8UeqB9ihQzVWQ5OGMpsFhyk.m1iQloKF411m7CRdfb0lny',
    'MAINTENANCE',
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'analista.teste@example.com'
);

-- Vincula apenas o usuario que acabou de ser criado.
SET @test_login_user_id = IF(ROW_COUNT() = 1, LAST_INSERT_ID(), NULL);

INSERT INTO user_units (user_id, unit_id, is_default)
SELECT id, unit_id, TRUE
FROM users
WHERE id = @test_login_user_id;

-- Gestor de Teste: gestor.teste@example.com / Gestor@Teste2026!
INSERT INTO users (unit_id, name, email, password_hash, role, active)
SELECT
    (SELECT id FROM units WHERE code = 'BAAK' AND active = TRUE),
    'Gestor de Teste',
    'gestor.teste@example.com',
    '$2b$12$4COo3YH0QmojUdAMYxjUxemOC1Bkpd2qit2oRN5p9re0J9QnJjC.G',
    'MANAGER',
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE email = 'gestor.teste@example.com'
);

-- Vincula apenas o usuario que acabou de ser criado.
SET @test_login_user_id = IF(ROW_COUNT() = 1, LAST_INSERT_ID(), NULL);

INSERT INTO user_units (user_id, unit_id, is_default)
SELECT id, unit_id, TRUE
FROM users
WHERE id = @test_login_user_id;

SET @test_login_user_id = NULL;

COMMIT;
