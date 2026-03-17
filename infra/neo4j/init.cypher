// Constraints
CREATE CONSTRAINT person_user_id IF NOT EXISTS FOR (p:Person) REQUIRE p.user_id IS UNIQUE;
CREATE CONSTRAINT person_orb_id IF NOT EXISTS FOR (p:Person) REQUIRE p.orb_id IS UNIQUE;

// Indexes
CREATE INDEX person_email IF NOT EXISTS FOR (p:Person) ON (p.email);
CREATE INDEX skill_name IF NOT EXISTS FOR (s:Skill) ON (s.name);
CREATE INDEX collaborator_name IF NOT EXISTS FOR (c:Collaborator) ON (c.name);

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
