// Constraints
CREATE CONSTRAINT user_user_id IF NOT EXISTS FOR (u:User) REQUIRE u.user_id IS UNIQUE;

// Indexes
CREATE INDEX connected_to_created_at IF NOT EXISTS FOR ()-[r:CONNECTED_TO]-() ON (r.created_at);
