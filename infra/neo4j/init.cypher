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
