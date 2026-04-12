// Constraints
CREATE CONSTRAINT person_user_id IF NOT EXISTS FOR (p:Person) REQUIRE p.user_id IS UNIQUE;
CREATE CONSTRAINT person_orb_id IF NOT EXISTS FOR (p:Person) REQUIRE p.orb_id IS UNIQUE;

// Invitation system: closed-beta access codes and singleton config
CREATE CONSTRAINT access_code_unique IF NOT EXISTS FOR (a:AccessCode) REQUIRE a.code IS UNIQUE;
CREATE CONSTRAINT beta_config_singleton IF NOT EXISTS FOR (c:BetaConfig) REQUIRE c.singleton IS UNIQUE;

// Indexes
CREATE INDEX person_email IF NOT EXISTS FOR (p:Person) ON (p.email);
CREATE INDEX person_is_admin IF NOT EXISTS FOR (p:Person) ON (p.is_admin);
CREATE INDEX person_signup_code IF NOT EXISTS FOR (p:Person) ON (p.signup_code);
CREATE INDEX person_visibility IF NOT EXISTS FOR (p:Person) ON (p.visibility);
CREATE INDEX skill_name IF NOT EXISTS FOR (s:Skill) ON (s.name);

// Vector indexes for semantic search
CREATE VECTOR INDEX education_embedding IF NOT EXISTS
  FOR (e:Education) ON (e.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX work_experience_embedding IF NOT EXISTS
  FOR (w:WorkExperience) ON (w.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX certification_embedding IF NOT EXISTS
  FOR (c:Certification) ON (c.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX publication_embedding IF NOT EXISTS
  FOR (p:Publication) ON (p.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX project_embedding IF NOT EXISTS
  FOR (p:Project) ON (p.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

CREATE VECTOR INDEX training_embedding IF NOT EXISTS
  FOR (t:Training) ON (t.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};

// Ontology versioning
CREATE CONSTRAINT ontology_version_id IF NOT EXISTS FOR (ov:OntologyVersion) REQUIRE ov.version_id IS UNIQUE;
CREATE INDEX ontology_content_hash IF NOT EXISTS FOR (ov:OntologyVersion) ON (ov.content_hash);

// Processing records
CREATE CONSTRAINT processing_record_id IF NOT EXISTS FOR (pr:ProcessingRecord) REQUIRE pr.record_id IS UNIQUE;
CREATE INDEX processing_record_document IF NOT EXISTS FOR (pr:ProcessingRecord) ON (pr.document_id);

// Share tokens for controlled public access
CREATE CONSTRAINT share_token_id IF NOT EXISTS FOR (st:ShareToken) REQUIRE st.token_id IS UNIQUE;

// Access grants for restricted-mode allowlists
CREATE CONSTRAINT access_grant_id IF NOT EXISTS FOR (g:AccessGrant) REQUIRE g.grant_id IS UNIQUE;
CREATE INDEX access_grant_email IF NOT EXISTS FOR (g:AccessGrant) ON (g.email);

// LLM usage tracking
CREATE CONSTRAINT llm_usage_id IF NOT EXISTS FOR (u:LLMUsage) REQUIRE u.usage_id IS UNIQUE;
CREATE INDEX llm_usage_endpoint IF NOT EXISTS FOR (u:LLMUsage) ON (u.endpoint);

// Connection requests for restricted orbs
CREATE CONSTRAINT connection_request_id IF NOT EXISTS FOR (cr:ConnectionRequest) REQUIRE cr.request_id IS UNIQUE;
CREATE INDEX connection_request_status IF NOT EXISTS FOR (cr:ConnectionRequest) ON (cr.status);
CREATE INDEX connection_request_requester IF NOT EXISTS FOR (cr:ConnectionRequest) ON (cr.requester_user_id);

// Refresh tokens (hashed) for access token rotation
CREATE CONSTRAINT refresh_token_id IF NOT EXISTS FOR (rt:RefreshToken) REQUIRE rt.token_id IS UNIQUE;
CREATE INDEX refresh_token_hash IF NOT EXISTS FOR (rt:RefreshToken) ON (rt.hash);
CREATE INDEX refresh_token_expires_at IF NOT EXISTS FOR (rt:RefreshToken) ON (rt.expires_at);

// MCP API keys (hashed) for agent/machine authentication
CREATE CONSTRAINT mcp_api_key_id IF NOT EXISTS FOR (k:MCPApiKey) REQUIRE k.key_id IS UNIQUE;
CREATE INDEX mcp_api_key_hash IF NOT EXISTS FOR (k:MCPApiKey) ON (k.hash);
