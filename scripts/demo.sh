#!/usr/bin/env bash
# Demo storyboard ~5 min — press ENTER between each step to advance.
# Usage: ./scripts/demo.sh
# Requires: running backend on API_URL (default http://localhost:3000), jq.

set -euo pipefail

API="${API_URL:-http://localhost:3000}"
STAMP="$(date +%s)"
TENANT_NAME="DEMO-${STAMP}"
TENANT_DOMAIN="demo-${STAMP}.highfive.app"
OWNER_EMAIL="alice.${STAMP}@demo.fr"
MEMBER_EMAIL="bob.${STAMP}@demo.fr"
PASSWORD="SecureP@ss123"

B=$(tput bold); G=$(tput setaf 2); C=$(tput setaf 6); Y=$(tput setaf 3); D=$(tput dim); N=$(tput sgr0)

pause() { echo; read -rp "${D}  ↵ press enter${N}" _ || true; echo; }
title() { clear; echo "${B}${C}━━━ $1 ━━━${N}"; echo "${D}$2${N}"; echo; }
run()   { echo "${Y}\$ ${1}${N}"; eval "$1"; echo; }
say()   { echo "${B}${G}▸ ${1}${N}"; }

# ─────────────────────────────────────────────────────────────
title "HighFive! — Core Backend demo" "Multi-tenant NestJS + PostgreSQL. REST, JWT, domain events."
say   "On va créer un tenant DEMO, deux users, un projet, des membres, des tickets — et regarder les events."
pause

# 1. Tenant creation (public route)
title "1/10 — Multi-tenancy" "POST /tenants est @Public : une nouvelle école s'enregistre sans contexte existant."
run "curl -sS -X POST ${API}/tenants -H 'Content-Type: application/json' -d '{\"name\":\"${TENANT_NAME}\",\"domain\":\"${TENANT_DOMAIN}\"}' | jq"
TENANT_ID=$(curl -sS "${API}/tenants" | jq -r ".[] | select(.domain==\"${TENANT_DOMAIN}\") | .id")
echo "${D}→ tenantId capturé : ${TENANT_ID}${N}"
pause

# 2. Protected route without X-Tenant-ID → 400 from TenantGuard
title "2/10 — TenantGuard" "Sans header X-Tenant-ID sur une route non-publique, le TenantGuard renvoie 400."
run "curl -sS -o /tmp/demo.out -w 'HTTP %{http_code}\n' ${API}/projects && cat /tmp/demo.out | jq"
pause

# 3. Register owner
title "3/10 — Register (Alice)" "argon2 pour le hash, JWT access + refresh retournés direct."
OWNER_REGISTER=$(curl -sS -X POST "${API}/auth/register" -H "X-Tenant-ID: ${TENANT_ID}" -H 'Content-Type: application/json' -d "{\"email\":\"${OWNER_EMAIL}\",\"password\":\"${PASSWORD}\"}")
echo "${Y}\$ curl -sS -X POST ${API}/auth/register -H 'X-Tenant-ID: ${TENANT_ID}' ...${N}"
echo "${OWNER_REGISTER}" | jq '{accessToken: (.accessToken | .[0:40] + "..."), refreshToken: (.refreshToken | .[0:20] + "...")}'
OWNER_TOKEN=$(echo "${OWNER_REGISTER}" | jq -r .accessToken)
pause

# 4. Protected route with tenant but no JWT → 401
title "4/10 — JwtAuthGuard" "Tenant OK mais pas de Bearer token → 401."
run "curl -sS -o /tmp/demo.out -w 'HTTP %{http_code}\n' ${API}/projects -H 'X-Tenant-ID: ${TENANT_ID}' && cat /tmp/demo.out | jq"
pause

# 5. /auth/me — whoami
title "5/10 — Qui suis-je ?" "GET /auth/me déchiffre le JWT et renvoie l'identité."
run "curl -sS ${API}/auth/me -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$OWNER_TOKEN\" | jq"
OWNER_ID=$(curl -sS "${API}/auth/me" -H "X-Tenant-ID: ${TENANT_ID}" -H "Authorization: Bearer ${OWNER_TOKEN}" | jq -r .id)
pause

# 6. Create a project
title "6/10 — Création de projet" "Le créateur devient automatiquement OWNER. Events émis : project.created + project.member.added."
run "curl -sS -X POST ${API}/projects -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$OWNER_TOKEN\" -H 'Content-Type: application/json' -d '{\"name\":\"Campus Flow\",\"description\":\"Flux étudiant temps réel\",\"visibility\":\"PRIVATE\"}' | jq"
PROJECT_ID=$(curl -sS "${API}/projects" -H "X-Tenant-ID: ${TENANT_ID}" -H "Authorization: Bearer ${OWNER_TOKEN}" | jq -r '.data[0].id')
echo "${D}→ projectId=${PROJECT_ID}${N}"
pause

# 7. Register member + add to project
title "7/10 — Rôles projet" "Bob s'inscrit, puis Alice (OWNER) l'ajoute en MEMBER."
MEMBER_REGISTER=$(curl -sS -X POST "${API}/auth/register" -H "X-Tenant-ID: ${TENANT_ID}" -H 'Content-Type: application/json' -d "{\"email\":\"${MEMBER_EMAIL}\",\"password\":\"${PASSWORD}\"}")
MEMBER_TOKEN=$(echo "${MEMBER_REGISTER}" | jq -r .accessToken)
MEMBER_ID=$(curl -sS "${API}/auth/me" -H "X-Tenant-ID: ${TENANT_ID}" -H "Authorization: Bearer ${MEMBER_TOKEN}" | jq -r .id)
echo "${D}→ memberId=${MEMBER_ID}${N}"
run "curl -sS -X POST ${API}/projects/${PROJECT_ID}/members -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$OWNER_TOKEN\" -H 'Content-Type: application/json' -d '{\"userId\":\"${MEMBER_ID}\",\"role\":\"MEMBER\"}' | jq"
pause

# 8. Create ticket
title "8/10 — Tickets" "Alice crée un ticket et l'assigne à Bob."
run "curl -sS -X POST ${API}/projects/${PROJECT_ID}/tickets -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$OWNER_TOKEN\" -H 'Content-Type: application/json' -d '{\"title\":\"Prototype UI mobile\",\"description\":\"Figma → React Native\",\"assigneeId\":\"${MEMBER_ID}\"}' | jq"
TICKET_ID=$(curl -sS "${API}/projects/${PROJECT_ID}/tickets" -H "X-Tenant-ID: ${TENANT_ID}" -H "Authorization: Bearer ${OWNER_TOKEN}" | jq -r '.data[0].id')
echo "${D}→ ticketId=${TICKET_ID}${N}"
pause

# 9. Bob moves ticket IN_PROGRESS
title "9/10 — Ticket state machine" "Bob (MEMBER) déplace son ticket en IN_PROGRESS."
run "curl -sS -X PATCH ${API}/projects/${PROJECT_ID}/tickets/${TICKET_ID} -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$MEMBER_TOKEN\" -H 'Content-Type: application/json' -d '{\"status\":\"IN_PROGRESS\"}' | jq"
pause

# 10. Project chat
title "10/10 — Chat projet" "Messages scopés au projet — Alice pose une question, puis on liste."
run "curl -sS -X POST ${API}/projects/${PROJECT_ID}/messages -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$OWNER_TOKEN\" -H 'Content-Type: application/json' -d '{\"content\":\"Bob, la maquette avance ?\"}' | jq"
run "curl -sS ${API}/projects/${PROJECT_ID}/messages -H 'X-Tenant-ID: ${TENANT_ID}' -H \"Authorization: Bearer \$OWNER_TOKEN\" | jq"
pause

# Bonus: domain events
title "BONUS — Domain events" "Chaque action a émis un event (logger = stub pour futurs consumers BullMQ/ML)."
run "docker logs highfive_backend_core --tail 80 2>&1 | grep -i DomainEvents | tail -15"
echo
say "Fin. Tenant ${TENANT_NAME}, projet Campus Flow, 1 ticket IN_PROGRESS, 1 message — tout en Postgres."
