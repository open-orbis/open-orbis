-- Orbis PostgreSQL schema
-- Tabular data: drafts, ideas, orb snapshots, CV document metadata.
-- Graph data stays in Neo4j.

-- Draft notes
CREATE TABLE IF NOT EXISTS drafts (
    uid TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drafts_user ON drafts(user_id);

-- User ideas / feedback
CREATE TABLE IF NOT EXISTS ideas (
    idea_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas(user_id);

-- Orb version snapshots
CREATE TABLE IF NOT EXISTS orb_snapshots (
    snapshot_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger TEXT NOT NULL,
    label TEXT,
    node_count INTEGER NOT NULL,
    edge_count INTEGER NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (user_id, snapshot_id)
);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON orb_snapshots(user_id, created_at DESC);

-- CV document metadata
CREATE TABLE IF NOT EXISTS cv_documents (
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    page_count INTEGER NOT NULL,
    entities_count INTEGER,
    edges_count INTEGER,
    PRIMARY KEY (user_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_cv_documents_user ON cv_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_cv_documents_uploaded ON cv_documents(user_id, uploaded_at DESC);
