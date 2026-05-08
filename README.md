# 🎾 Beach Tennis — Gerenciador de Partidas

Sistema web para gerenciar e exibir partidas de Beach Tennis em tempo real.

---

## Stack

| Camada    | Tecnologia                          |
|-----------|-------------------------------------|
| Frontend  | React 18 + Vite + TailwindCSS       |
| Backend   | Node.js + Express                   |
| ORM       | Prisma                              |
| Banco     | PostgreSQL (Neon)                   |
| Deploy FE | Vercel                              |
| Deploy BE | Qualquer host Node (Railway, Render, VPS) |

---

## Estrutura do Projeto

```
ChamadaTorneio/
├── client/                  # Frontend React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Admin.jsx    # Painel de gerenciamento
│   │   │   └── TV.jsx       # Tela de exibição (TV/placar)
│   │   ├── api.js           # Cliente HTTP
│   │   ├── App.jsx          # Roteamento
│   │   └── main.jsx
│   ├── vercel.json          # Configuração de deploy Vercel
│   └── package.json
└── server/                  # Backend Node.js
    ├── prisma/
    │   ├── schema.prisma    # Schema do banco
    │   └── seed.js          # Dados de exemplo
    ├── src/
    │   ├── lib/prisma.js    # Cliente Prisma singleton
    │   ├── routes/
    │   │   ├── teams.js
    │   │   ├── courts.js
    │   │   └── matches.js
    │   └── index.js         # Entry point Express
    └── package.json
```

---

## Pré-requisitos

- Node.js 18+
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
node prisma/seed.js

# 5. Rodar o servidor
npm run dev       # desenvolvimento (nodemon)
npm start         # produção
```

O servidor sobe em **http://localhost:3001**.

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

---

## Variáveis de Ambiente

### server/.env
```env
DATABASE_URL="postgresql://user:password@host/beach_tennis?sslmode=require"
PORT=3001
```

### client/.env
```env
VITE_API_URL=http://localhost:3001
```
> Em produção, aponte para a URL do seu servidor Node deployado.

---

## Banco de Dados — Neon (PostgreSQL)

1. Acesse [neon.tech](https://neon.tech) e crie uma conta gratuita
2. Crie um projeto e copie a **Connection String**
3. Cole em `server/.env` como `DATABASE_URL`
4. Execute `npx prisma db push` para criar as tabelas

---

## Páginas

| Rota     | Descrição                                      |
|----------|------------------------------------------------|
| `/admin` | Painel de gerenciamento (quadras, duplas, partidas) |
| `/tv`    | Tela de placar em tempo real (atualiza a cada 3s) |

---

## API Reference

Base URL: `http://localhost:3001`

### Times (Duplas)

```
GET    /teams          Lista todas as duplas
POST   /teams          Cria uma dupla
```

### Quadras

```
GET    /courts         Lista todas as quadras
POST   /courts         Cria uma quadra
```

### Partidas

```
GET    /matches            Lista todas as partidas
GET    /matches/active     Lista partidas em andamento (status: playing)
POST   /matches            Cria uma partida
POST   /matches/:id/start  Inicia a partida (waiting → playing)
POST   /matches/:id/finish Finaliza a partida (playing → finished)
POST   /matches/:id/score  Adiciona ponto a uma dupla
POST   /matches/:id/undo   Desfaz o último ponto
```

---

## Exemplos de Requisições

### Criar quadra
```bash
curl -X POST http://localhost:3001/courts \
  -H "Content-Type: application/json" \
  -d '{"name": "Quadra 1"}'
```

### Criar dupla
```bash
curl -X POST http://localhost:3001/teams \
  -H "Content-Type: application/json" \
  -d '{"player1": "João Silva", "player2": "Pedro Costa"}'
```

### Criar partida
```bash
curl -X POST http://localhost:3001/matches \
  -H "Content-Type: application/json" \
  -d '{"teamAId": "ID_DUPLA_A", "teamBId": "ID_DUPLA_B", "courtId": "ID_QUADRA"}'
```

### Iniciar partida
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/start
```

### Adicionar ponto (Dupla A)
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/score \
  -H "Content-Type: application/json" \
  -d '{"team": "A"}'
```

### Adicionar ponto (Dupla B)
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/score \
  -H "Content-Type: application/json" \
  -d '{"team": "B"}'
```

### Desfazer último ponto
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/undo
```

### Finalizar partida
```bash
curl -X POST http://localhost:3001/matches/ID_PARTIDA/finish
```

### Ver partidas ativas
```bash
curl http://localhost:3001/matches/active
```

---

## Deploy

### Frontend → Vercel

```bash
cd client
npm run build
# ou conecte o repositório no painel da Vercel
# Configure a variável VITE_API_URL apontando para o backend deployado
```

O arquivo `client/vercel.json` já configura o roteamento para o React Router.

### Backend → Railway / Render / VPS

```bash
cd server
npm install
npx prisma db push
npm start
```

Defina `DATABASE_URL` e `PORT` nas variáveis de ambiente da plataforma.

---

## Schema do Banco

```prisma
model Team {
  id       String  @id @default(cuid())
  player1  String
  player2  String
}

model Court {
  id   String @id @default(cuid())
  name String
}

model Match {
  id         String   @id @default(cuid())
  teamAId    String
  teamBId    String
  courtId    String?
  scoreA     Int      @default(0)
  scoreB     Int      @default(0)
  prevScoreA Int      @default(0)   // para suporte a undo
  prevScoreB Int      @default(0)
  status     String   @default("waiting")  // waiting | playing | finished
  createdAt  DateTime @default(now())
}
```

---

## Funcionalidades

- [x] Criar e listar quadras
- [x] Criar e listar duplas
- [x] Criar partidas e atribuir a quadras
- [x] Iniciar / Finalizar partidas
- [x] Pontuar (+ 1 ponto por dupla)
- [x] Desfazer último ponto (undo)
- [x] Tela TV com atualização automática (3s, sem WebSocket)
- [x] Exibição por quadra com status em tempo real
- [x] Layout otimizado para resolução 1920×1080
