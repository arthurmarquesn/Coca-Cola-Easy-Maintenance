-- =========================================================
-- EASY MAINTENANCE
-- MIGRATION 2026-09-17
--
-- CRITICIDADE DOS EQUIPAMENTOS
--
-- Objetivos:
-- 1. adicionar criticidade A / B / C aos equipamentos;
-- 2. preservar equipamentos já cadastrados;
-- 3. criar automaticamente equipamentos que aparecem
--    nos apontamentos, mas ainda não existem no cadastro;
-- 4. relacionar maintenance_events.equipment_id;
-- 5. preparar o banco para análises gerenciais futuras.
--
-- IMPORTANTE:
-- esta migration NÃO altera Pareto nem Jack-Knife.
-- =========================================================

USE coca_cola_maintenance;


-- =========================================================
-- 1. ADICIONAR CRITICIDADE
-- =========================================================

ALTER TABLE equipments
    ADD COLUMN criticality ENUM(
        'A',
        'B',
        'C'
    ) NULL
    AFTER description,

    ADD COLUMN criticality_justification TEXT NULL
    AFTER criticality,

    ADD COLUMN criticality_updated_by BIGINT UNSIGNED NULL
    AFTER criticality_justification,

    ADD COLUMN criticality_updated_at DATETIME NULL
    AFTER criticality_updated_by;


-- =========================================================
-- 2. ÍNDICES
-- =========================================================

ALTER TABLE equipments
    ADD KEY idx_equipments_criticality (
        criticality
    ),

    ADD KEY idx_equipments_criticality_updated_by (
        criticality_updated_by
    );


-- =========================================================
-- 3. USUÁRIO RESPONSÁVEL PELA CLASSIFICAÇÃO
-- =========================================================

ALTER TABLE equipments
    ADD CONSTRAINT fk_equipments_criticality_updated_by
        FOREIGN KEY (
            criticality_updated_by
        )
        REFERENCES users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL;


-- =========================================================
-- 4. PRIMEIRO TENTAR VINCULAR EVENTOS A EQUIPAMENTOS
--    QUE JÁ EXISTEM
--
-- Fazemos comparação normalizada pelo nome.
-- =========================================================

UPDATE
    maintenance_events me

INNER JOIN
    equipments eq
        ON eq.unit_id =
           me.unit_id

        AND UPPER(
            TRIM(
                eq.name
            )
        ) =
        UPPER(
            TRIM(
                me.source_equipment_name
            )
        )

SET
    me.equipment_id =
        eq.id

WHERE
    me.equipment_id IS NULL

    AND me.source_equipment_name IS NOT NULL

    AND TRIM(
        me.source_equipment_name
    ) <> '';


-- =========================================================
-- 5. CRIAR EQUIPAMENTOS QUE AINDA NÃO POSSUEM CADASTRO
--
-- O código SRC-* é interno e determinístico.
--
-- Isso significa:
-- o mesmo equipamento + unidade sempre produz
-- o mesmo código.
-- =========================================================

INSERT INTO equipments (
    unit_id,
    production_line_id,
    code,
    name,
    description,
    criticality,
    criticality_justification,
    active
)

SELECT
    me.unit_id,

    NULL
        AS production_line_id,

    CONCAT(
        'SRC-',
        LEFT(
            SHA2(
                CONCAT(
                    me.unit_id,
                    '|',
                    UPPER(
                        TRIM(
                            me.source_equipment_name
                        )
                    )
                ),
                256
            ),
            24
        )
    )
        AS code,

    TRIM(
        me.source_equipment_name
    )
        AS name,

    'Equipamento criado automaticamente a partir dos apontamentos importados.'
        AS description,

    NULL
        AS criticality,

    NULL
        AS criticality_justification,

    TRUE
        AS active

FROM
    maintenance_events me

WHERE
    me.equipment_id IS NULL

    AND me.source_equipment_name IS NOT NULL

    AND TRIM(
        me.source_equipment_name
    ) <> ''

GROUP BY
    me.unit_id,

    TRIM(
        me.source_equipment_name
    )

ON DUPLICATE KEY UPDATE

    name =
        VALUES(
            name
        ),

    active =
        TRUE;


-- =========================================================
-- 6. VINCULAR OS EVENTOS AOS EQUIPAMENTOS
--    CRIADOS AUTOMATICAMENTE
-- =========================================================

UPDATE
    maintenance_events me

INNER JOIN
    equipments eq
        ON eq.unit_id =
           me.unit_id

        AND eq.code =
        CONCAT(
            'SRC-',
            LEFT(
                SHA2(
                    CONCAT(
                        me.unit_id,
                        '|',
                        UPPER(
                            TRIM(
                                me.source_equipment_name
                            )
                        )
                    ),
                    256
                ),
                24
            )
        )

SET
    me.equipment_id =
        eq.id

WHERE
    me.equipment_id IS NULL

    AND me.source_equipment_name IS NOT NULL

    AND TRIM(
        me.source_equipment_name
    ) <> '';


-- =========================================================
-- 7. CRIAR ALIASES PARA OS NOMES ORIGINAIS IMPORTADOS
--
-- Isso prepara o cadastro para futuramente reconhecer
-- variações do nome do mesmo equipamento.
-- =========================================================

INSERT IGNORE INTO equipment_aliases (
    equipment_id,
    alias,
    normalized_alias,
    source_system,
    active
)

SELECT DISTINCT
    me.equipment_id,

    TRIM(
        me.source_equipment_name
    )
        AS alias,

    UPPER(
        TRIM(
            me.source_equipment_name
        )
    )
        AS normalized_alias,

    me.source_system,

    TRUE

FROM
    maintenance_events me

WHERE
    me.equipment_id IS NOT NULL

    AND me.source_equipment_name IS NOT NULL

    AND TRIM(
        me.source_equipment_name
    ) <> '';


-- =========================================================
-- 8. VERIFICAÇÃO
-- =========================================================

SELECT
    COUNT(*) AS total_equipamentos,

    SUM(
        criticality = 'A'
    ) AS criticidade_a,

    SUM(
        criticality = 'B'
    ) AS criticidade_b,

    SUM(
        criticality = 'C'
    ) AS criticidade_c,

    SUM(
        criticality IS NULL
    ) AS sem_criticidade

FROM
    equipments;


-- =========================================================
-- 9. EQUIPAMENTOS ENCONTRADOS NOS APONTAMENTOS
-- =========================================================

SELECT
    eq.id,

    eq.unit_id,

    eq.code,

    eq.name,

    eq.criticality,

    COUNT(
        me.id
    ) AS ocorrencias,

    ROUND(
        SUM(
            COALESCE(
                me.downtime_minutes,
                0
            )
        ),
        2
    ) AS downtime_minutes

FROM
    equipments eq

LEFT JOIN
    maintenance_events me
        ON me.equipment_id =
           eq.id

GROUP BY
    eq.id,
    eq.unit_id,
    eq.code,
    eq.name,
    eq.criticality

ORDER BY
    ocorrencias DESC,
    downtime_minutes DESC,
    eq.name ASC;


-- =========================================================
-- 10. VALIDAR EVENTOS QUE CONTINUARAM SEM EQUIPMENT_ID
-- =========================================================

SELECT
    COUNT(*) AS eventos_sem_equipamento_vinculado

FROM
    maintenance_events

WHERE
    equipment_id IS NULL

    AND source_equipment_name IS NOT NULL

    AND TRIM(
        source_equipment_name
    ) <> '';