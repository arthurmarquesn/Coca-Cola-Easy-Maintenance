-- =========================================================
-- MIGRAÇÃO 001 - REMOÇÃO DOS PAPÉIS ADMIN E VIEWER
--
-- O sistema passa a ter apenas dois papéis:
--
--   MAINTENANCE (Analista) - acesso total, o que o
--                            ADMIN tinha antes
--   MANAGER     (Gestor)   - apenas consulta os dados
--
-- Rode em um banco JÁ EXISTENTE. Para um banco novo use
-- database/schema.sql, que já está atualizado.
--
-- ATENÇÃO: faça um backup antes.
--   mysqldump -u USUARIO -p coca_cola_maintenance > backup.sql
-- =========================================================

USE coca_cola_maintenance;


-- =========================================================
-- 1. CONFERÊNCIA (opcional)
--
-- Mostra quantos usuários existem por papel antes da
-- conversão. Útil para comparar com o resultado final.
-- =========================================================

SELECT
    role,
    COUNT(*) AS total

FROM users

GROUP BY role;


-- =========================================================
-- 2. CONVERSÃO DOS USUÁRIOS
--
-- ADMIN  -> MAINTENANCE (Analista)
--   Inclui o usuário inicial teste@email.com, que passa
--   a ser Analista e mantém o acesso total.
--
-- VIEWER -> MANAGER (Gestor)
--   VIEWER nunca aparecia na tela e só consultava dados,
--   que é exatamente o papel do Gestor.
--
-- O ENUM antigo ainda aceita estes valores, então o
-- UPDATE roda antes do ALTER TABLE.
-- =========================================================

UPDATE users
SET role = 'MAINTENANCE'
WHERE role = 'ADMIN';

UPDATE users
SET role = 'MANAGER'
WHERE role = 'VIEWER';


-- =========================================================
-- 3. NOVO ENUM
--
-- Só rode depois do passo 2. Se ainda houver algum
-- usuário com ADMIN ou VIEWER, o MySQL recusa o ALTER
-- (ou zera o campo, dependendo do sql_mode).
-- =========================================================

ALTER TABLE users
    MODIFY COLUMN role ENUM(
        'MAINTENANCE',
        'MANAGER'
    ) NOT NULL DEFAULT 'MANAGER';


-- =========================================================
-- 4. CONFERÊNCIA FINAL
--
-- O resultado deve conter apenas MAINTENANCE e MANAGER.
-- =========================================================

SELECT
    role,
    COUNT(*) AS total

FROM users

GROUP BY role;


SELECT
    name,
    email,
    role,
    active

FROM users

WHERE email = 'teste@email.com';
