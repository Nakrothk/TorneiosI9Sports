# 🎾 Beach Tennis — Gerenciador de Partidas

Sistema web para montar torneios de Beach Tennis (grupos, chaves e Copa do Mundo) e chamar as partidas na TV.

---

## Stack

| Camada    | Tecnologia                          |
|-----------|-------------------------------------|
| Frontend  | React 18 + Vite + TailwindCSS       |
| Backend   | Node.js + Express                   |
| Auth      | JWT (`jsonwebtoken`)                |
| ORM       | Prisma                              |
| Banco     | PostgreSQL (Neon)                   |
| Deploy    | Railway (monorepo: o Express serve o build do client) |

---

## Estrutura do Projeto

```
TorneiosI9Sports/
├── package.json             # Scripts raiz (build/start do monorepo)
├── railway.json             # Configuração de deploy Railway (monorepo)
├── .github/workflows/
│   └── db-backup.yml        # Backup diário do banco (pg_dump)
├── client/                  # Frontend React + Vite
│   ├── public/              # Logos i9 (cabeçalho e impressões)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Admin.jsx    # Painel de gerenciamento (abas)
│   │   │   ├── Login.jsx    # Login do admin
│   │   │   ├── TV.jsx       # Tela de chamada das partidas (TV)
│   │   │   └── Placar.jsx   # Placar da Copa do Mundo (celular)
│   │   ├── api.js           # Cliente HTTP (envia o token JWT)
│   │   ├── App.jsx          # Roteamento
│   │   └── main.jsx
│   ├── vercel.json          # Configuração de deploy Vercel (alternativa)
│   └── package.json
└── server/                  # Backend Node.js
    ├── prisma/
    │   ├── schema.prisma    # Schema do banco
    │   └── seed.js          # Dados de exemplo
    ├── scripts/             # Scripts avulsos (ex.: seed-teams.js)
    ├── src/
    │   ├── lib/
    │   │   ├── prisma.js    # Cliente Prisma singleton
    │   │   ├── jwtSecret.js # Segredo do JWT
    │   │   └── standings.js # Classificação dos grupos (critério de desempate)
    │   ├── middleware/
    │   │   └── auth.js      # Exige token, exceto nas rotas públicas
    │   ├── routes/
    │   │   ├── auth.js
    │   │   ├── teams.js
    │   │   ├── courts.js
    │   │   ├── matches.js
    │   │   ├── tournaments.js
    │   │   ├── tournamentFolders.js
    │   │   └── import.js
    │   └── index.js         # Entry point Express
    ├── test/                # Testes (node --test)
    ├── railway.json         # Deploy só do server (Railway)
    └── package.json
```

---

## Pré-requisitos

- Node.js 20+
- npm ou yarn
- Banco PostgreSQL (recomendado: [Neon](https://neon.tech) — grátis)

---

## Setup — Backend

```bash
cd server

# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env e coloque sua DATABASE_URL do Neon

# 3. Criar tabelas no banco
npx prisma db push

# 4. (Opcional) Popular com dados de exemplo
#    Atenção: apaga partidas, duplas e quadras existentes
node prisma/seed.js

# 5. Rodar o servidor
npm run dev       # desenvolvimento (nodemon)
npm start         # produção
```

O servidor sobe em **http://localhost:3001**.

Outros scripts do server: `npm run db:studio` (Prisma Studio) e `npm run db:reset` (recria o banco do zero e roda o seed).

Testes do server: `npm test` (roda `node --test "test/**/*.test.js"`, sem banco). O glob é explícito para o `node --test` não executar `scripts/test-write.js`, que grava no banco.

---

## Setup — Frontend

```bash
cd client

# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite .env — aponte VITE_API_URL para o servidor

# 3. Rodar em desenvolvimento
npm run dev

# 4. Build para produção
npm run build
```

O frontend sobe em **http://localhost:5173**.

Da raiz do repositório também dá para usar `npm run dev:server` e `npm run dev:client`.

---

## Variáveis de Ambiente

### server/.env
```env
DATABASE_URL="postgresql://user:password@host/beach_tennis?sslmode=require"
PORT=3001
JWT_SECRET="troque-em-producao"   # opcional; sem ele o server usa um segredo fixo do código
```

### client/.env
```env
VITE_API_URL=http://localhost:3001
```
> Em produção no Railway, deixe `VITE_API_URL` sem definir: o client chama a API na mesma origem. Só defina se o frontend for hospedado separado do backend (ex.: Vercel).

---

## Banco de Dados — Neon (PostgreSQL)

1. Acesse [neon.tech](https://neon.tech) e crie uma conta gratuita
2. Crie um projeto e copie a **Connection String**
3. Cole em `server/.env` como `DATABASE_URL`
4. Execute `npx prisma db push` para criar as tabelas

---

## Páginas

| Rota      | Descrição                                      |
|-----------|------------------------------------------------|
| `/login`  | Login do admin (o token JWT vale 7 dias)       |
| `/admin`  | Painel de gerenciamento — exige login. Abas: Chaves, Torneios, Copa do Mundo, Duplas, Quadras, Chamada de Jogos, Arquivados |
| `/tv`     | Tela de chamada: partida chamada (com quadra) ou próxima partida, com som (atualiza a cada 3s) |
| `/placar` | Placar dos times da Copa do Mundo para celular (atualiza a cada 3s) |

`/` redireciona para `/admin`.

---

## API Reference

Base URL: `http://localhost:3001`

Todas as rotas exigem o header `Authorization: Bearer <token>`, exceto `POST /auth/login`, `GET /health`, `GET /matches/tv` e `GET /tournaments` (usadas pela TV e pelo `/placar`). A lista de rotas públicas fica em `server/src/middleware/auth.js`.

### Auth

```
POST   /auth/login     Retorna { token } (JWT, 7 dias)
GET    /health         Healthcheck
```

### Times (Duplas)

```
GET    /teams          Lista todas as duplas
POST   /teams          Cria uma dupla (player1, player2 e category obrigatórios)
PUT    /teams/:id      Edita jogadores, categoria ou cor do time
DELETE /teams/:id      Exclui uma dupla
DELETE /teams          Exclui todas as duplas (desvincula das partidas e remove inscrições)
GET    /teams/export   Exporta as duplas em .xlsx
POST   /teams/import   Importa duplas de .xlsx (multipart, campo "file")
```

### Quadras

```
GET    /courts         Lista todas as quadras
POST   /courts         Cria uma quadra
PUT    /courts/:id     Renomeia uma quadra
DELETE /courts/:id     Exclui uma quadra
```

### Partidas

```
GET    /matches               Lista todas as partidas
GET    /matches/active        Lista partidas em andamento (status: playing)
GET    /matches/current       Última partida chamada
GET    /matches/tv            { called, next } para a tela da TV
POST   /matches               Cria uma partida (duplas por id ou por nome livre)
POST   /matches/:id/call      Chama a partida na TV
POST   /matches/:id/mark-next Marca/desmarca como próxima (só uma por vez)
POST   /matches/:id/start     Inicia a partida (waiting → playing)
POST   /matches/:id/finish    Finaliza (aceita scoreA/scoreB) e avança o vencedor na chave (e o perdedor da semi para o 3º lugar)
POST   /matches/:id/score     Adiciona ponto a uma dupla (só em playing)
POST   /matches/:id/undo      Desfaz o último ponto (só em playing)
POST   /matches/:id/edit      Corrige o placar (marca como finalizada e ajusta vencedor e perdedor na chave, se a partida seguinte não foi finalizada)
POST   /matches/:id/court     Troca a quadra
POST   /matches/:id/category  Troca a categoria
POST   /matches/:id/set-teams Troca as duplas
POST   /matches/:id/set-time  Define o horário (scheduledTime)
PUT    /matches/:id/position  Define a ordem (position)
DELETE /matches/:id           Exclui a partida
```

### Torneios

Um evento é o conjunto de torneios com o mesmo `name` + `category` (um por grupo, mais a chave final).

Critério de classificação nos grupos e entre grupos (ex.: com 3 grupos, os 2 melhores classificados vão direto para a semi): vitórias → saldo de games → games pró. A coluna P (pontos) é só exibida, não ordena. O server usa `server/src/lib/standings.js`; o client repete o mesmo critério em `byStandingCriteria` (`client/src/pages/Admin.jsx`) na classificação e na Previsão Final — mude os dois juntos.

```
GET    /tournaments                          Lista torneios com duplas e partidas
POST   /tournaments                          Cria um torneio (type: bracket | ffa)
POST   /tournaments/create-event             Cria um evento com 1 a 6 grupos (A–F)
POST   /tournaments/generate-bracket         Gera a chave final a partir da classificação dos grupos, com disputa de 3º lugar
POST   /tournaments/assign-folder            Arquiva (com snapshot) ou desarquiva um evento inteiro
POST   /tournaments/:id/teams                Inscreve uma dupla
DELETE /tournaments/:id/teams/:teamId        Remove uma dupla
POST   /tournaments/:id/generate             Gera as partidas do grupo (todos contra todos)
DELETE /tournaments/:id/matches              Apaga só as partidas do torneio
DELETE /tournaments/:id                      Exclui o torneio
PUT    /tournaments/:id/teams/:teamId/color  Define a cor do time da dupla (Copa do Mundo)
POST   /tournaments/:id/ffa-batch-teams      Copa do Mundo: inscreve várias duplas num time
DELETE /tournaments/:id/ffa-teams/:teamId    Copa do Mundo: remove uma dupla
POST   /tournaments/:id/ffa-groups           Copa do Mundo: cria um grupo de 4 duplas (uma por cor)
POST   /tournaments/:id/ffa-auto-generate    Copa do Mundo: gera os confrontos entre cores
GET    /tournaments/:id/ffa-standings        Copa do Mundo: classificação por cor
POST   /tournaments/:id/ffa-finals           Copa do Mundo: gera semis/final/3º lugar
```

### Pastas (Arquivados)

```
GET    /tournament-folders       Lista as pastas
POST   /tournament-folders       Cria uma pasta
PUT    /tournament-folders/:id   Renomeia
DELETE /tournament-folders/:id   Exclui (só se estiver vazia)
```

### Importação de partidas

```
GET    /import/template   Baixa a planilha modelo (.xlsx)
POST   /import            Importa partidas de .xlsx (multipart, campo "file")
```

---

## Exemplos de Requisições

### Login
```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "EMAIL_ADMIN", "password": "SENHA_ADMIN"}'
# Guarde o token retornado: TOKEN=...
```

### Criar quadra
```bash
curl -X POST http://localhost:3001/courts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Quadra 1"}'
```

### Criar dupla
```bash
curl -X POST http://localhost:3001/teams \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"player1": "João Silva", "player2": "Pedro Costa", "category": "Masculina A"}'
```

### Criar partida
```bash
curl -X POST http://localhost:3001/matches \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"teamAId": "ID_DUPLA_A", "teamBId": "ID_DUPLA_B", "courtId": "ID_QUADRA"}'
```

### Iniciar partida
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/start \
  -H "Authorization: Bearer $TOKEN"
```

### Adicionar ponto (Dupla A)
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/score \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"team": "A"}'
```

### Adicionar ponto (Dupla B)
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/score \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"team": "B"}'
```

### Desfazer último ponto
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/undo \
  -H "Authorization: Bearer $TOKEN"
```

### Finalizar partida
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/finish \
  -H "Authorization: Bearer $TOKEN"
```

### Ver partidas ativas
```bash
curl http://localhost:3001/matches/active \
  -H "Authorization: Bearer $TOKEN"
```

---

## Deploy

### Railway (monorepo)

O `railway.json` da raiz faz o deploy de tudo num serviço só:

- **Build:** `npm install` + `npm run build` do client e `npm install` + `npx prisma generate` do server.
- **Start:** `cd server && npx prisma db push && node src/index.js` — o schema é aplicado no banco a cada deploy. Se uma mudança no schema causar perda de dados, o `db push` falha e o serviço não sobe.
- **Healthcheck:** `GET /health`.
- O Express serve `client/dist` quando a pasta existe, então frontend e API ficam na mesma origem.

Defina `DATABASE_URL` e `JWT_SECRET` nas variáveis de ambiente do Railway (`PORT` é fornecida pela plataforma).

### Alternativa — Frontend na Vercel

```bash
cd client
npm run build
# ou conecte o repositório no painel da Vercel
# Configure a variável VITE_API_URL apontando para o backend deployado
```

O arquivo `client/vercel.json` já configura o roteamento para o React Router.

### Backup do banco

O workflow `.github/workflows/db-backup.yml` roda `pg_dump` todo dia às 03:00 (Brasília) e guarda o dump como artifact por 30 dias. Precisa do secret `DATABASE_URL` no repositório; também pode ser rodado manualmente pela aba Actions.

---

## Schema do Banco

A fonte da verdade é `server/prisma/schema.prisma`. Resumo dos models:

| Model              | Papel |
|--------------------|-------|
| `Team`             | Dupla (`player1`, `player2`, `category`, `colorTeam` da Copa do Mundo) |
| `Court`            | Quadra |
| `Tournament`       | Um grupo ou a chave final de um evento (`name` + `category`). `group` vazio = chave final (ou torneio sem grupos); `type` = `bracket` ou `ffa` (Copa do Mundo); ao arquivar recebe `folderId` e um `snapshot` congelado |
| `TournamentFolder` | Pasta da aba Arquivados |
| `TournamentEntry`  | Inscrição de uma dupla num torneio (`seed`, `colorTeam`) |
| `Match`            | Partida. `status`: `waiting` → `playing` → `finished`; `nextMatchId` liga o vencedor à próxima fase da chave e `loserNextMatchId` liga o perdedor da semi à disputa de 3º lugar (`round: 'terceiro lugar'`); `teamAName`/`teamBName` para chamadas avulsas sem dupla cadastrada; `calledAt`/`isNext` controlam a TV |

---

## Funcionalidades

- [x] Login do admin com JWT
- [x] Criar, editar e excluir quadras e duplas (com categoria)
- [x] Importar/exportar duplas em planilha .xlsx
- [x] Eventos com grupos (todos contra todos) e chave final gerada pela classificação (vitórias → saldo → games pró), com disputa de 3º lugar
- [x] Copa do Mundo: times por cor (Verde, Amarelo, Azul, Branco), classificação e finais
- [x] Iniciar / Finalizar partidas, com avanço automático do vencedor na chave (e do perdedor da semi para o 3º lugar)
- [x] Pontuar (+ 1 ponto por dupla) e desfazer último ponto (undo)
- [x] Corrigir o placar de partidas já finalizadas
- [x] Horário (dia + hora) por partida
- [x] Chamada de jogos na TV com som, próxima partida e chamadas avulsas (atualização a cada 3s, sem WebSocket)
- [x] Impressão das chaves de uma categoria (grupos, previsão final e chave final) em A4 retrato, com no máximo 2 caixas por linha
- [x] Arquivados: pastas com cópia congelada dos torneios
- [x] Abas do admin podem ser ocultadas (preferência salva no navegador)
- [x] Layout da TV otimizado para resolução 1920×1080
