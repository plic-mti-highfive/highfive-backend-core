-- ============================================================================
-- Seed de démonstration pour le dashboard admin.
-- Idempotent : purge d'abord les données précédemment seedées (emails
-- 'seed.%@highfive.test' et projets dont le nom finit par '[seed]'),
-- puis régénère utilisateurs / projets / membres / highfives / connexions /
-- refresh tokens pour le tenant cible.
--
-- Usage :
--   docker compose exec -T db psql -U highfive -d highfive_dev \
--     -v tenant="'<TENANT_UUID>'" -f - < scripts/seed-admin-data.sql
-- (le tenant par défaut ci-dessous peut aussi être édité directement)
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  -- Tenant cible (celui de l'instance courante).
  -- NB: tenant_id est `uuid` sur users/projects (relation Tenant) mais `varchar`
  -- sur les autres tables (colonne simple) → on garde les deux formes.
  v_tenant uuid := '6413a58c-78c4-4029-b99c-445a2c347af7';
  v_tenant_txt text := '6413a58c-78c4-4029-b99c-445a2c347af7';
  -- Hash placeholder (les comptes seedés ne se connectent pas).
  v_hash text := '$argon2id$v=19$m=65536,t=3,p=4$c2VlZHNlZWRzZWVk$3Zq3Yx0gq0Yx0gq0Yx0gq0Yx0gq0Yx0gq0Yx0gq0Y';

  v_user_ids uuid[] := '{}';
  v_uid uuid;
  v_pid uuid;
  i int;
  j int;
  v_first text;
  v_last text;
  v_status text;
  v_role text;
  v_created timestamptz;
  v_pstatus text;
  v_owner uuid;
  v_member uuid;

  n_users int := 60;
  n_proj  int := 28;

  firsts text[] := ARRAY['Alice','Sophie','Thomas','Marie','Jean','Lisa','Paul','Emma',
    'Lucas','Chloé','Hugo','Léa','Nathan','Manon','Enzo','Camille','Louis','Sarah',
    'Jules','Inès','Gabriel','Jade','Arthur','Zoé','Raphaël'];
  lasts text[] := ARRAY['Dupont','Martin','Bernard','Laurent','Moreau','Petit','Durand',
    'Leroy','Roux','Fournier','Girard','Bonnet','Lambert','Fontaine','Rousseau','Vincent',
    'Muller','Lefebvre','Garnier','Faure'];
  statuses text[] := ARRAY['ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE','ACTIVE',
    'PENDING','PENDING','SUSPENDED']; -- pondéré
  projwords text[] := ARRAY['Nebula','Horizon','Atlas','Phoenix','Quantum','Aurora','Nimbus',
    'Vertex','Echo','Lumen','Orbit','Cascade','Pixel','Forge','Spark','Drift','Comet',
    'Mosaic','Pulse','Zenith'];
  pstatuses text[] := ARRAY['ACTIVE','ACTIVE','ACTIVE','ARCHIVED','DRAFT'];
  member_roles text[] := ARRAY['MEMBER','MEMBER','ADMIN','VIEWER'];
BEGIN
  -- ── Cleanup des données seedées précédentes ──────────────────────────────
  DELETE FROM project_highfives WHERE project_id IN (
    SELECT id FROM projects WHERE tenant_id = v_tenant AND name LIKE '%[seed]');
  DELETE FROM project_members WHERE project_id IN (
    SELECT id FROM projects WHERE tenant_id = v_tenant AND name LIKE '%[seed]');
  DELETE FROM projects WHERE tenant_id = v_tenant AND name LIKE '%[seed]';

  DELETE FROM user_connections WHERE tenant_id = v_tenant_txt AND (
    requester_id IN (SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test')
    OR addressee_id IN (SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test'));
  DELETE FROM refresh_tokens WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test');
  DELETE FROM user_profiles WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test');
  DELETE FROM users WHERE tenant_id = v_tenant AND email LIKE 'seed.%@highfive.test';

  -- ── Utilisateurs + profils ───────────────────────────────────────────────
  FOR i IN 1..n_users LOOP
    v_first  := firsts[1 + (i % array_length(firsts, 1))];
    v_last   := lasts[1 + (i % array_length(lasts, 1))];
    v_status := statuses[1 + (i % array_length(statuses, 1))];
    v_role   := CASE WHEN i <= 2 THEN 'ADMIN' ELSE 'USER' END;
    -- Étalé sur les 30 derniers jours (densité plus forte sur la semaine).
    v_created := now() - make_interval(days => (i % 30), hours => ((i * 7) % 24));
    v_uid := gen_random_uuid();

    INSERT INTO users(id, tenant_id, email, password_hash, status, system_role, created_at, updated_at)
    VALUES (v_uid, v_tenant, 'seed.' || lower(v_first) || '.' || i || '@highfive.test',
            v_hash, v_status::users_status_enum, v_role::users_system_role_enum, v_created, v_created);

    INSERT INTO user_profiles(user_id, tenant_id, display_name, bio, theme_preference, email_notifications)
    VALUES (v_uid, v_tenant_txt, v_first || ' ' || v_last, 'Membre de la communauté HighFive', 'light', true);

    v_user_ids := array_append(v_user_ids, v_uid);
  END LOOP;

  -- ── Projets + owner + membres + highfives ────────────────────────────────
  FOR i IN 1..n_proj LOOP
    v_pstatus := pstatuses[1 + (i % array_length(pstatuses, 1))];
    v_created := now() - make_interval(days => (i % 30));
    v_pid := gen_random_uuid();

    INSERT INTO projects(id, tenant_id, name, description, status, visibility, created_at, updated_at)
    VALUES (v_pid, v_tenant,
            'Projet ' || projwords[1 + (i % array_length(projwords, 1))] || ' ' || i || ' [seed]',
            'Projet de démonstration n°' || i || ' généré pour le dashboard admin.',
            v_pstatus::projects_status_enum, 'PUBLIC'::projects_visibility_enum,
            v_created,
            CASE WHEN v_pstatus = 'ARCHIVED'
                 THEN now() - make_interval(days => (i % 6))  -- clôture récente
                 ELSE v_created END);

    -- Owner
    v_owner := v_user_ids[1 + (i % n_users)];
    INSERT INTO project_members(project_id, user_id, tenant_id, role, created_at)
    VALUES (v_pid, v_owner, v_tenant_txt, 'OWNER'::project_members_role_enum, v_created)
    ON CONFLICT DO NOTHING;

    -- Membres (2 à 5)
    FOR j IN 1..(2 + (i % 4)) LOOP
      v_member := v_user_ids[1 + ((i * 3 + j * 7) % n_users)];
      IF v_member <> v_owner THEN
        INSERT INTO project_members(project_id, user_id, tenant_id, role, created_at)
        VALUES (v_pid, v_member, v_tenant_txt,
                member_roles[1 + (j % array_length(member_roles, 1))]::project_members_role_enum,
                v_created)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- Highfives (nombre variable, 0..12)
    FOR j IN 1..((i * 5) % 13) LOOP
      v_member := v_user_ids[1 + ((i + j * 11) % n_users)];
      INSERT INTO project_highfives(project_id, user_id, tenant_id, created_at)
      VALUES (v_pid, v_member, v_tenant_txt, now() - make_interval(days => (j % 10)))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- ── Connexions acceptées (→ followersCount) ──────────────────────────────
  FOR i IN 1..n_users LOOP
    FOR j IN 1..(i % 6) LOOP
      v_member := v_user_ids[1 + ((i + j * 13) % n_users)];
      IF v_member <> v_user_ids[i] THEN
        INSERT INTO user_connections(id, requester_id, addressee_id, tenant_id, status, created_at)
        VALUES (gen_random_uuid(), v_user_ids[i], v_member, v_tenant_txt,
                'ACCEPTED'::user_connections_status_enum, now() - make_interval(days => (j % 20)));
      END IF;
    END LOOP;
  END LOOP;

  -- ── Refresh tokens valides (→ onlineUsers, proxy de présence) ─────────────
  FOR i IN 1..n_users LOOP
    IF i % 3 = 0 THEN
      INSERT INTO refresh_tokens(id, user_id, tenant_id, token_hash, expires_at, revoked, created_at)
      VALUES (gen_random_uuid(), v_user_ids[i], v_tenant_txt,
              md5(random()::text || i::text), now() + interval '7 days', false, now());
    END IF;
  END LOOP;

  RAISE NOTICE 'Seed terminé : % utilisateurs, % projets.', n_users, n_proj;
END $$;
