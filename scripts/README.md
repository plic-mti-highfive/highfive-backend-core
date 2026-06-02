# Scripts

## `seed-admin-data.sql` — données de démo pour le dashboard admin

Remplit la base d'un jeu de données réaliste (utilisateurs, projets, membres,
highfives, connexions, refresh tokens) afin que le **dashboard admin** ait du
contenu à afficher : KPIs, graphe d'inscriptions sur 30 jours, projets
récemment clos, etc.

Le script est **idempotent** : à chaque exécution il purge d'abord les données
précédemment générées (utilisateurs `seed.%@highfive.test` et projets dont le
nom se termine par `[seed]`) avant de régénérer. Il ne touche pas aux données
réelles.

### Prérequis

La stack Docker doit être lancée et la base prête :

```bash
docker compose up -d
docker compose ps          # le service `db` doit être "healthy"
```

> Le schéma doit déjà exister. Il est créé automatiquement par TypeORM
> (`synchronize`) au démarrage du backend en `NODE_ENV=development` — ce qui est
> le cas via le `docker-compose.yml` du projet.

### Lancer le seed

Depuis la racine du repo :

```bash
docker compose exec -T db psql -U highfive -d highfive_dev < scripts/seed-admin-data.sql
```

En cas de succès, la dernière ligne affiche :

```
NOTICE:  Seed terminé : 60 utilisateurs, 28 projets.
DO
```

> `-U highfive` / `-d highfive_dev` correspondent aux valeurs `DB_USERNAME` /
> `DB_DATABASE` du `.env`. Adaptez si vous les avez modifiées.

### Cibler un autre tenant

Le tenant est codé en tête du script (variables `v_tenant` / `v_tenant_txt`).
Pour seeder un autre tenant, éditez ces deux variables avec l'UUID voulu.
Récupérer la liste des tenants :

```bash
docker compose exec -T db psql -U highfive -d highfive_dev -c "SELECT id, name FROM tenants;"
```

### Devenir administrateur plateforme

Le dashboard est réservé au rôle `ADMIN`. Promouvoir un compte existant :

```bash
docker compose exec -T db psql -U highfive -d highfive_dev \
  -c "UPDATE users SET system_role='ADMIN' WHERE email='votre.email@example.com';"
```

Ensuite, cet admin peut promouvoir/rétrograder les autres via
`PATCH /admin/users/:id/role`.

### Nettoyer les données de démo

Pour supprimer uniquement les données seedées sans en régénérer :

```bash
docker compose exec -T db psql -U highfive -d highfive_dev <<'SQL'
DELETE FROM project_highfives WHERE project_id IN (SELECT id FROM projects WHERE name LIKE '%[seed]');
DELETE FROM project_members  WHERE project_id IN (SELECT id FROM projects WHERE name LIKE '%[seed]');
DELETE FROM projects WHERE name LIKE '%[seed]';
DELETE FROM user_connections WHERE requester_id IN (SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test')
                                OR addressee_id IN (SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test');
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test');
DELETE FROM user_profiles  WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'seed.%@highfive.test');
DELETE FROM users WHERE email LIKE 'seed.%@highfive.test';
SQL
```
