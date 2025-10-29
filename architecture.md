# Image Evaluation Admin — ARCHITECTURE

This document explains how I extended the base repository to provide a locally runnable **Admin** application that reads sample data (CSV + images), seeds MongoDB (via Prisma), shows admin UI to review prompt/image entries, runs a multi-agent heuristic evaluation for each image, and persists the results.

---

## Project layout (high level)

```
image-eval-admin/
├─ app/                    # Next.js App Router (Admin UI + API routes)
│  ├─ api
|  |  ├─login/route.ts
|  |  ├─signup/route.ts
│  │  ├─/protected prompts/route.ts     # GET prompts with relations
│  │  └─ protected/evaluate/id/route.ts or evaluate/route.ts  # POST evaluation (accepts id in URL or body)
│  └─ admin/page.tsx         # Admin dashboard UI (fetch, evaluate, filter)
|  └─ login/page.tsx 
|  └─ signup/page.tsx
├─ middleware.ts #to implement secure user authentication , authorization, protected routes
├─ prisma/
│  ├─ schema.prisma          # Prisma schema for User, Brand, Prompt, Evaluation
│  └─ seed.ts                # TypeScript seed script (reads CSVs, upserts data)
├─ data/                    # CSVs: users.csv, brands.csv, prompts.csv
├─ public/sample_images/    # sample images referenced by prompts
├─ .env.local               # DATABASE_URL (MongoDB)
└─ package.json
```

Notes:

* The app uses the App Router (`app/`) and server components for data fetching where appropriate.
* All static images live in `public/sample_images` and are referenced in DB as `sample_images/<file>`.

---

## How the base repo was extended (key files / modules)

* `prisma/schema.prisma` — data model. Defines`Admin` ,  `User`, `Brand`, `Prompt`, and `Evaluation` with Mongo DB object id fields and relations.
* `prisma/seed.ts` — TypeScript ES module script using `csv-parser` + `prisma` to seed `users`, `brands`, and `prompts` into the DB (uses upsert for idempotency).
* `app/api/protected/prompts/route.ts` — API endpoint that returns prompts with `user`, `brand`, and evaluation history. Used by admin UI.
* `app/api/protected/evaluate/id/route.ts` (or `evaluate/route.ts`) — multi-agent evaluation endpoint. Reads the prompt from DB, runs heuristic agents, persists an `Evaluation`, and updates the prompt with the `endScore`.
* `app/admin/page.tsx` — Admin dashboard UI (client component) that:

  * fetches `/api/protcted/prompts`
  * displays thumbnail, prompt text, brand, user
  * allows Evaluate action
  * shows the 4 agent scores + end score upon completion

* `app/signup.tsx` — page to signup new admin
* `app/login.tsx`- page to login an admin

---

## Data model and MongoDB choices



**Prisma models (summary)**

```prisma

model Admin { id String @id @map("_id") @db.ObjectId email String @unique name String password String createdAt } #created seperate collection for admins, can be integrated in users as well by making use of userRole

  
  
model User { id String @id @map("_id") @db.ObjectId userId String @unique userName String userRole String prompts Prompt[] }


model Brand { id String @id @map("_id") @db.ObjectId brandId String @unique brandName String ... prompts Prompt[] }

model Prompt { id String @id @map("_id") @db.ObjectId imagePath String prompt String LLM_Model String? channel String? userId String? brandId String? timeStamp DateTime? evaluation String? evaluations Evaluation[] }

model Evaluation { id String @id @map("_id") @db.ObjectId promptId String sizeScore Float? subjectScore Float? creativityScore Float? moodScore Float? endScore Float? createdAt DateTime @default(now()) prompt Prompt @relation(fields:[promptId], references:[id]) }
```



## Agent roles, orchestration, and scoring formula

### Agents (Heuristic implementations)

* **Agent A — Size Compliance (image properties)**

  * Uses `sharp` to read image dimensions (width × height).
  * Heuristic: if width ≥ 300 and height ≥ 300 -> score 100. Otherwise score = (width*height) / (300*300) * 100 (clamped).
  * Output: `sizeScore` (0–100), width, height.

* **Agent B — Subject Adherence (prompt vs image)**

  * Compares tokenized prompt words against the image filename (lowercased). Counts matches and computes ratio.
  * Heuristic: `score = min(100, matchCount / promptLength * 200)` (gives boost to short prompts with exact match).
  * Output: `subjectScore` (0–100).

* **Agent C — Creativity & Mood**

  * Creativity: based on prompt word count: `min(100, (wordCount / 15) * 100)` — longer/more descriptive prompts score higher.
  * Mood: pseudo-random value in a range (60–100) or optionally seeded from prompt to be deterministic.
  * Output: `creativityScore` and `moodScore` (0–100).

### Aggregation (Agent C / Aggregator)

* The aggregator calculates a simple average of the four scores:

```
endScore = round((sizeScore + subjectScore + creativityScore + moodScore) / 4)
```

* We persist all four sub-scores and `endScore` to the `Evaluation` collection. The `Prompt` record is also updated with `evaluation` (stringified `endScore`) and optionally `evaluationId`.

### Orchestration

* The API route orchestrates the flow as follows:

  1. Receive `promptId` ( from  request body).
  2. Load the `Prompt` document from DB (including `imagePath` and prompt text).
  3. Run agents in parallel where possible (size requires file IO so it's async).
  4. Aggregate results and persist an `Evaluation` (atomic single creation).
  5. Update the `Prompt` document with `evaluation` and `evaluationId`.
  6. Return the saved evaluation JSON to the client for immediate UI update.

The UI then updates in-memory state to reflect the newly stored evaluation without a full page refresh.

---



## Trade-offs & design decisions

### Heuristics vs LLMs

* **Heuristics chosen**: deterministic, zero-cost, and fast for local demos. They are explainable and easy to test.
* **LLM / Vision models** would give richer, more accurate evaluations (subject recognition, semantic match, mood detection) but:

  * cost and latency increase,
  * require API keys and rate limits,
  * bring non-determinism (unless seeded) and dependency on external services.

Decision: Start with heuristics (assignment requirement) and design the agents so they can be swapped for model-backed implementations later.

### Caching & batching

* Current design evaluates on-demand and persists per-evaluation.
* For scale:

  * Cache recent evaluations in Redis and show cached results instantly.
  * Batch evaluations (e.g., queue with workers) if doing heavy LLM calls — queue ensures responsiveness in UI and prevents API throttles.

### Data consistency

* `prisma.evaluation.create` is the source of truth for the evaluation; `prompt.evaluation` is a convenience field (denormalized). This supports quick filtering by score at the prompt level.

### Security

* Basic credential-based or NextAuth-based admin authentication is recommended before exposing evaluation APIs.
* Validate `imagePath` to avoid directory traversal and ensure images live within `public/sample_images`.

---

## Local setup & run steps (summary)

1. clone the Repo to Your local Machine
2. Add `.env.local` with `DATABASE_URL` (Mongo string with DB name) ,`JWT_SECRET` , `GEMINI API KEY` :

   
   DATABASE_URL="mongodb+srv://<name>:<Yourpassword>@cluster0.2rsibfh.mongodb.net/mavic?retryWrites=true&w=majority"
   
   
JWT_SECRET="mavic_secret"
GEMINI_API_SECRET
   
   
3. Install and generate Prisma client:


   npm install

   npm run db:generate (dotenv -e .env -- npx prisma generate)

   npm run db:push  (dotenv -e .env -- npx prisma db push)
   
   
4. Seed DB:

   ```bash
   npm run seed
   ```
5. Run dev server:

   ```bash
   npm run dev
   ```
6. Open Admin UI: `http://localhost:3000/signup` — signup as new user 
7. login after successful signup `http://localhost:3000/signup`
8. you will be redirected to admin page `http://localhost:3000/admin`

---

## Future improvements

* Replace heuristics with an LLM + vision module (optional) and add caching/batching.
* Add audit logs for evaluations and roles/permissions for multiple admins.
* Add CI checks and unit tests for agents.
* Add server-side filtering & pagination for large datasets.

---


