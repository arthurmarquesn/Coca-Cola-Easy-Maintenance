-- =========================================================
-- EASY MAINTENANCE
-- MIGRATION 2026-10-04
--
-- ÍNDICES DE ANALYTICS
--
-- 1. maintenance_events(unit_id, event_date): toda consulta
--    de gráficos, histórico e relatórios filtra pelos dois.
-- 2. classification_suggestions(event_id, model_type, status):
--    a subconsulta "sugestão mais recente por evento"
--    (src/lib/analytics/sql.ts) filtra por modelo e status.
-- 3. maintenance_events(unit_id, import_id): classificação ML
--    por importação e unidade.
--
-- Não altera dados. Rode uma vez; MySQL 8 não tem
-- CREATE INDEX IF NOT EXISTS.
-- =========================================================

USE coca_cola_maintenance;

CREATE INDEX idx_events_unit_date
  ON maintenance_events (unit_id, event_date);

CREATE INDEX idx_events_unit_import
  ON maintenance_events (unit_id, import_id);

CREATE INDEX idx_classification_suggestions_event_model_status
  ON classification_suggestions (event_id, model_type, status);
