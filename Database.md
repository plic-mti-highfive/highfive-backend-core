// --- Identity & Tenancy

Table tenants {
  id uuid [pk]
  name varchar(255) [not null]
  domain varchar(255) [unique, not null]
}

Table users {
  id uuid [pk]
  tenant_id uuid [not null, ref: > tenants.id]
  email varchar(255) [unique, not null]
  password_hash varchar(255) [not null]
  status user_status_enum [default: 'PENDING']
  system_role system_role_enum [default: 'USER']
}

Table user_profiles {
  user_id uuid [pk, ref: - users.id]
  tenant_id uuid [not null]
  display_name varchar(255)
  bio text
  avatar_path varchar(512)
  theme_preference varchar(20) [default: 'system']
  email_notifications boolean [default: true]
}

Table skills {
  id uuid [pk]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(50) [not null]
}

Table user_skills {
  user_id uuid [not null, ref: > users.id]
  skill_id uuid [not null, ref: > skills.id]
  tenant_id uuid [not null]
  indexes { (user_id, skill_id) [pk] }
}

Table user_connections {
  requester_id uuid [not null, ref: > users.id]
  addressee_id uuid [not null, ref: > users.id]
  tenant_id uuid [not null]
  status connection_status_enum [not null]
  created_at timestamp [default: `now()`]
  indexes { (requester_id, addressee_id) [pk] }
}

// ─── PROJECT EXECUTION ───────────────────
Table projects {
  id uuid [pk]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
  description text
  status project_status_enum [default: 'ACTIVE']
  visibility project_visibility_enum [default: 'PRIVATE']
  created_at timestamp [default: `now()`]
  updated_at timestamp [default: `now()`]
  deleted_at timestamp
}

Table tags {
  id uuid [pk]
  tenant_id uuid [not null, ref: > tenants.id]
  name varchar(255) [not null]
}

Table project_tags {
  project_id uuid [not null, ref: > projects.id]
  tag_id uuid [not null, ref: > tags.id]
  indexes { (project_id, tag_id) [pk] }
}

Table project_members {
  project_id uuid [not null, ref: > projects.id]
  user_id uuid [not null, ref: > users.id]
  tenant_id uuid [not null]
  role project_role_enum [not null]
  created_at timestamp [default: `now()`]
  indexes { (project_id, user_id) [pk] }
}

Table project_followers {
  project_id uuid [not null, ref: > projects.id]
  user_id uuid [not null, ref: > users.id]
  tenant_id uuid [not null]
  created_at timestamp [default: `now()`]
  indexes { (project_id, user_id) [pk] }
}

Table project_highfives {
  project_id uuid [not null, ref: > projects.id]
  user_id uuid [not null, ref: > users.id]
  tenant_id uuid [not null]
  created_at timestamp [default: `now()`]
  indexes { (project_id, user_id) [pk] }
}

Table tickets {
  id uuid [pk]
  project_id uuid [not null, ref: > projects.id]
  tenant_id uuid [not null]
  title varchar(255) [not null]
  description text
  status ticket_status_enum [default: 'TODO']
  assignee_id uuid [null, ref: > users.id]
  created_at timestamp [default: `now()`]
  updated_at timestamp [default: `now()`]
}

Table project_messages {
  id uuid [pk]
  project_id uuid [not null, ref: > projects.id]
  author_id uuid [null, ref: > users.id]
  tenant_id uuid [not null]
  content text [not null]
  attachment_path varchar(512)
  reply_to_id uuid [null, ref: > project_messages.id]
  created_at timestamp [default: `now()`]
}

// ─── SHOWCASE & COMMUNITY ────────────────
Table public_projects {
  project_id uuid [pk, ref: - projects.id]
  tenant_id uuid [not null]
  visibility project_visibility_enum [default: 'PRIVATE']
  page_schema jsonb [default: '{}', note: 'Config UI custom']
  stats jsonb [default: '{}', note: 'stars, views, etc.']
}

Table devlogs {
  id uuid [pk]
  project_id uuid [not null, ref: > projects.id]
  tenant_id uuid [not null]
  title varchar(255) [not null]
  cover_image_path varchar(512) [note: 'MinIO path']
  content jsonb [not null, note: 'Bloc editor (ex: TipTap)']
  published_at timestamp [default: `now()`]
}

Table project_comments {
  id uuid [pk]
  project_id uuid [not null, ref: > projects.id]
  author_id uuid [not null, ref: > users.id]
  tenant_id uuid [not null]
  content text [not null]
  created_at timestamp [default: `now()`]
}
