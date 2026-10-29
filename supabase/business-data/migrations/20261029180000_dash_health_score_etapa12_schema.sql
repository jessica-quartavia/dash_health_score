-- Etapa 12: schema _dash_health_score (Business Data rckpuebaiswrxzmywllv)
-- Somente este schema; não altera public nem outros apps.

CREATE SCHEMA IF NOT EXISTS _dash_health_score;

COMMENT ON SCHEMA _dash_health_score IS 'Health Analytics — monitoramento pseudonimizado e freezes prospectivos';

CREATE TABLE IF NOT EXISTS _dash_health_score.pipeline_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'env_check', 'partial')),
  pipeline_version TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  hs2a_version TEXT NOT NULL,
  population TEXT NOT NULL DEFAULT 'ativos',
  client_count INTEGER,
  snapshot_rows INTEGER DEFAULT 0,
  issue_rows INTEGER DEFAULT 0,
  freeze_rows INTEGER DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  bundle_checksum TEXT,
  n8n_execution_id TEXT,
  filters_fingerprint TEXT,
  version_fingerprint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_runs_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_reference_date ON _dash_health_score.pipeline_runs (reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON _dash_health_score.pipeline_runs (status);

CREATE TABLE IF NOT EXISTS _dash_health_score.client_snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES _dash_health_score.pipeline_runs (run_id) ON DELETE RESTRICT,
  client_ref TEXT NOT NULL CHECK (client_ref ~ '^m_[0-9a-f]{20}$'),
  reference_date DATE NOT NULL,
  population TEXT NOT NULL,
  health_score NUMERIC(8, 3),
  engagement_score NUMERIC(8, 3),
  mechanism_score NUMERIC(8, 3),
  final_class TEXT,
  profile_code TEXT,
  quality_code TEXT,
  phase_code TEXT,
  program TEXT,
  engineer TEXT,
  analytical_status TEXT,
  formula_version TEXT NOT NULL,
  hs2a_version TEXT NOT NULL,
  version_fingerprint TEXT NOT NULL,
  filters_fingerprint TEXT NOT NULL DEFAULT '',
  row_checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_snapshots_identity_unique UNIQUE (
    client_ref,
    reference_date,
    population,
    version_fingerprint,
    filters_fingerprint
  )
);

CREATE INDEX IF NOT EXISTS idx_client_snapshots_ref_date ON _dash_health_score.client_snapshots (reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_snapshots_client_ref ON _dash_health_score.client_snapshots (client_ref);
CREATE INDEX IF NOT EXISTS idx_client_snapshots_run ON _dash_health_score.client_snapshots (run_id);

CREATE TABLE IF NOT EXISTS _dash_health_score.snapshot_components (
  snapshot_id BIGINT PRIMARY KEY REFERENCES _dash_health_score.client_snapshots (snapshot_id) ON DELETE CASCADE,
  total_meetings INTEGER,
  days_since_last_meeting INTEGER,
  avg_meetings_per_month NUMERIC(10, 4),
  implemented_count INTEGER,
  reunioes_30d INTEGER,
  attendance_rate NUMERIC(8, 4),
  cobertura_reuniao TEXT,
  cobertura_mec TEXT,
  issue_keys TEXT[] DEFAULT '{}',
  extra JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS _dash_health_score.quality_issues (
  issue_id BIGSERIAL PRIMARY KEY,
  run_id UUID REFERENCES _dash_health_score.pipeline_runs (run_id) ON DELETE SET NULL,
  client_ref TEXT NOT NULL,
  reference_date DATE NOT NULL,
  issue_type TEXT NOT NULL,
  category TEXT,
  priority TEXT,
  evidence TEXT,
  source_field TEXT,
  recommended_action TEXT,
  rule_version TEXT NOT NULL DEFAULT 'hs2a-v1',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved_proven', 'absent_in_run')),
  identified_at DATE NOT NULL,
  resolved_at DATE,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quality_issues_identity_unique UNIQUE (client_ref, reference_date, issue_type, rule_version)
);

CREATE INDEX IF NOT EXISTS idx_quality_issues_ref ON _dash_health_score.quality_issues (reference_date DESC);
CREATE INDEX IF NOT EXISTS idx_quality_issues_client ON _dash_health_score.quality_issues (client_ref);
CREATE INDEX IF NOT EXISTS idx_quality_issues_status ON _dash_health_score.quality_issues (status);

CREATE TABLE IF NOT EXISTS _dash_health_score.prospective_freezes (
  freeze_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES _dash_health_score.pipeline_runs (run_id) ON DELETE SET NULL,
  reference_month TEXT NOT NULL CHECK (reference_month ~ '^\d{4}-\d{2}$'),
  reference_date DATE NOT NULL,
  population TEXT NOT NULL,
  formula_version TEXT NOT NULL,
  hs2a_version TEXT NOT NULL,
  transform_version TEXT NOT NULL,
  horizon_days INTEGER NOT NULL DEFAULT 90 CHECK (horizon_days > 0),
  maturation_date DATE,
  row_count INTEGER,
  integrity_hash TEXT NOT NULL,
  features_catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prospective_freezes_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_prospective_freezes_month ON _dash_health_score.prospective_freezes (reference_month DESC);

CREATE TABLE IF NOT EXISTS _dash_health_score.prospective_features (
  feature_row_id BIGSERIAL PRIMARY KEY,
  freeze_id UUID NOT NULL REFERENCES _dash_health_score.prospective_freezes (freeze_id) ON DELETE CASCADE,
  client_ref TEXT NOT NULL,
  features JSONB NOT NULL,
  CONSTRAINT prospective_features_freeze_client_unique UNIQUE (freeze_id, client_ref)
);

CREATE INDEX IF NOT EXISTS idx_prospective_features_client ON _dash_health_score.prospective_features (client_ref);

CREATE TABLE IF NOT EXISTS _dash_health_score.churn_outcomes (
  outcome_id BIGSERIAL PRIMARY KEY,
  client_ref TEXT NOT NULL,
  freeze_id UUID REFERENCES _dash_health_score.prospective_freezes (freeze_id) ON DELETE SET NULL,
  horizon_days INTEGER NOT NULL,
  event_date DATE,
  source TEXT,
  censored BOOLEAN NOT NULL DEFAULT true,
  consolidation_version TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (censored = true OR event_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_churn_outcomes_freeze ON _dash_health_score.churn_outcomes (freeze_id);

-- Segurança: RLS ativo, sem políticas para anon/authenticated
ALTER TABLE _dash_health_score.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE _dash_health_score.client_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE _dash_health_score.snapshot_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE _dash_health_score.quality_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE _dash_health_score.prospective_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE _dash_health_score.prospective_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE _dash_health_score.churn_outcomes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA _dash_health_score FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA _dash_health_score FROM PUBLIC;
GRANT USAGE ON SCHEMA _dash_health_score TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA _dash_health_score TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA _dash_health_score TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA _dash_health_score GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA _dash_health_score GRANT USAGE, SELECT ON SEQUENCES TO service_role;
