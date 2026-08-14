# DEPLOYMENT.md

บันทึกรอบ deploy ครั้งแรกของ BudgetFlow ขึ้น production (2026-08-03) — เขียนไว้ให้ตัวเองในอนาคต (หรือคนอื่น) อ่านแล้วเข้าใจได้โดยไม่ต้องไล่ chat log

---

## Infrastructure

- **Backend**: Render Web Service (free tier, Singapore region)
  - URL: https://budgetflow-wpdg.onrender.com
  - Root Directory: `backend`
  - Build: `npm install && npx prisma generate && npm run build && npm run db:migrate:prod`
  - Start: `node dist/server.js`
- **Database**: Neon Postgres (ap-southeast-1, free tier, pooled connection)
- **Frontend**: Vercel (Hobby plan)
  - Root Directory: `frontend`
  - Framework: Vite

## Environment Variables ที่ตั้งไว้

| ที่ | ตัวแปร |
|---|---|
| Render | `NODE_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN` |
| Vercel | `VITE_API_URL` |

หมายเหตุ: `ENABLE_IN_PROCESS_CRON` **ตั้งใจไม่ตั้ง** บน Render — cron รายวัน (budget alert + recurring) รันผ่าน GitHub Actions (`.github/workflows/daily-job.yml`) แทน ไม่ใช่ in-process `node-cron` ในตัว server (ดู `server.ts` — ถูก gate ไว้หลัง env var นี้)

## ปัญหาที่เจอและวิธีแก้ (บันทึกไว้กันลืม)

1. Build fail `"Missing script: build"` → ลืมตั้ง Root Directory เป็น `backend`
2. Start fail `"Missing script: start:prod"` → โปรเจกต์เป็น Express ไม่ใช่ NestJS ต้องใช้ `node dist/server.js`
3. Prisma auth failed → เผลอใส่ `<>` ครอบรหัสผ่านใน connection string
4. Postman 422 Validation failed → ลืมเปลี่ยน body type จาก Text เป็น JSON
5. Login ไม่ได้หลังแก้ password ใน Neon ตรงๆ → column `password` เก็บ bcrypt hash แก้มือไม่ได้ ต้อง seed ใหม่
6. `VITE_API_URL` fallback ใช้ `??` แทน `||` → `.env.example` มีค่าว่าง (`VITE_API_URL=`) ทำให้ไม่ fallback (ดูรายละเอียดใน section ของ Claude ด้านล่าง — commit `98ae8a4`)
7. `POST /accounts/setup-balance` ตอบ 404 บน production → **ไม่ใช่ route หาย** (route ตรวจแล้วมีอยู่จริง ยิงตรงไป production พบ 401 ตอนไม่มี token ไม่ใช่ 404) แต่เป็น application-level 404 ที่ route โยนเองตอนหา default account ไม่เจอ (`account.routes.ts` — `if (!account) throw ... status: 404`) สาเหตุจริงคือ `seed.ts` เดิม upsert account ด้วย `update: {}` (no-op) พอเปลี่ยน seed จาก `demo@budgetflow.app` เป็น `admin@budgetflow.app` (commit `2d3dfef`) แล้วรัน seed ซ้ำ แถว account id คงที่ `demo-account-id` ที่มีอยู่แล้วเลยไม่ถูกผูก `userId` ใหม่ให้ admin user — ยืนยันจริงบน production ด้วย `GET /accounts` (login ด้วย admin) ได้ `accounts: []` แก้แล้วที่ `seed.ts` (commit `9e145b9`, เปลี่ยน `update: {}` → `update: { userId: user.id }`) — **ต้องรัน `db:seed` ใหม่บน production เองด้วยมือเพื่อให้ data จริงถูกแก้** (ดูหัวข้อ "รัน seed ใหม่บน production" ด้านล่าง — ยังไม่ได้รันตอนเขียนบันทึกนี้)

## เมื่อไหร่ต้องรัน `db:seed` ใหม่บน production ด้วยมือ

Render build command (`npm ci && npm run build && npm run db:migrate:prod`) รันแค่ `prisma migrate deploy` เท่านั้น **ไม่รัน seed ให้อัตโนมัติ** ต้องรันเองทุกครั้งที่:
- แก้ `backend/prisma/seed.ts` แล้วต้องการให้ผลบน production ตรงกับ local (เช่นบั๊กนี้ — แก้โค้ด seed ไม่ได้แปลว่า data บน production ถูกแก้ไปด้วย)
- หลัง `prisma migrate reset` หรือสร้าง Neon database ใหม่ (schema ว่างเปล่า ไม่มี seed data เลย)
- หลัง data migration ที่ลบ/ย้าย user หรือ account ที่ seed ผูกไว้ (เช่นเปลี่ยน seed email แล้วของเดิมยังอยู่ใน DB)

**วิธีรัน** (ดูรายละเอียดคำสั่งเต็มในรอบ 2026-08-04 ด้านล่าง): set `DATABASE_URL` ของ production ใน shell session ชั่วคราว (`$env:DATABASE_URL = "..."` ใน PowerShell) แล้ว `npm run db:seed` จาก `backend/` — **ห้าม**เขียน production `DATABASE_URL` ลงไฟล์ที่ commit เข้า repo ไม่ว่ากรณีใด

## ที่ยังค้างอยู่

- [ ] เปลี่ยนรหัส Neon (หลุดใน chat ระหว่าง debug) แล้วอัปเดต `DATABASE_URL` ใน Render
- [x] ~~แก้ `CORS_ORIGIN` ใน Render ให้ตรงกับ Vercel production domain จริง~~ — ตรวจซ้ำ 2026-08-04 ด้วย curl preflight ตรงไป production พบว่าจริงๆ ถูกแก้ไปแล้ว (`Access-Control-Allow-Origin: https://budgetflow-kohl.vercel.app` ไม่ใช่ placeholder) มีคนไปแก้ตรงใน Render dashboard โดยไม่ได้ sync กลับมาที่ `render.yaml`/todo นี้ — เหลือแค่แก้ `render.yaml` ให้ตรงกับของจริงเพื่อไม่ให้ blueprint sync ครั้งหน้าทับด้วยค่า placeholder เก่า
- [x] ~~เปลี่ยน demo account เป็น email/name ที่เหมาะสมกว่า (เริ่มทำแล้วบางส่วน — ดู commit `2d3dfef`) — และหน้า `LoginPage.tsx` ยังโชว์ hint `Demo: demo@budgetflow.app / Password123!` ค้างอยู่ ซึ่งใช้ login ไม่ได้แล้วบน production ตั้งแต่ reseed เป็น `admin@budgetflow.app` (ยืนยันแล้วว่า login ด้วย demo@ ได้ `"Invalid credentials"`)~~ — แก้ hint ใน `LoginPage.tsx` ให้ตรงกับ `seed.ts` แล้ว (และ `CLAUDE.md` ที่มี hardcode เดียวกัน) ตรวจแล้วไม่มี hardcode credential ค้างที่อื่นอีก
- [ ] node-cron ไม่ทำงานจริงบน Render free tier (spin down 15 นาที) — พึ่ง GitHub Actions แทน
- [ ] `uploads/` เป็น ephemeral ไฟล์หายทุก deploy
- [x] ~~รัน `npm run db:seed` บน production (Neon) เพื่อ apply commit `9e145b9` จริง~~ — รันแล้ว 2026-08-04 ยืนยันผ่านทั้ง `GET /accounts` (curl) และ UI จริง (login เป็น admin เห็น Total Balance ฿30,000, Budget Buckets ครบ) — `setup-balance` 404 หายแล้ว

---

## ส่วนของ Claude — สิ่งที่ตรวจ/แก้ในรอบนี้

### Commits รอบนี้

ทั้งหมดอยู่บน `main`, commit `2d3dfef` ยังไม่ได้ push ตอนเขียนไฟล์นี้ (ที่เหลือ push แล้ว)

| Hash | สรุป |
|---|---|
| `0f1a14a` | fix: close zero-based invariant bypasses in setup-balance and batch-transaction |
| `b10eb70` | fix: close TOCTOU races in budget/transaction/transfer checks, stale pool cache |
| `6aa0a06` | fix: close phantom-read gap in budget/setup-balance invariant lock |
| `98ae8a4` | fix: harden frontend API base URL fallback for Vercel deploy prep |
| `2d3dfef` | chore: reseed default account as admin@budgetflow.app instead of demo user |

### ไฟล์ที่แก้ พร้อมเหตุผล

**`0f1a14a` — ปิดช่องโหว่ invariant ที่ไม่ต้องมี concurrency ก็ทะลุได้:**
- `backend/src/features/accounts/account.routes.ts` — `POST /accounts/setup-balance` เดิม set `Account.balance` ตรงๆ ไม่เช็คกับ Σ `Budget.allocatedAmount` เลย ผู้ใช้ปกติกด "แก้ยอดเงินเริ่มต้น" ครั้งเดียวก็พังกฎ zero-based ได้ — เพิ่มการเช็ค
- `backend/src/features/transactions/transaction.routes.ts`, `transaction.validation.ts` — `POST /transactions/batch` ไม่มี `express-validator` chain เลย (route เดี่ยวมี) — เพิ่ม `batchTransactionValidation`
- `backend/src/features/transactions/transaction.service.ts` — `batchCreate()` ไม่เคยเช็คงบเหลือสำหรับ EXPENSE เลย ต่างจาก `create()` เดี่ยว — เพิ่ม running-remaining check ต่อ budget ในชุดเดียวกัน

**`b10eb70` — ปิด TOCTOU race รอบแรก (ยังไม่สมบูรณ์ ดู `6aa0a06`):**
- `backend/src/features/budgets/budget.repository.ts`, `budget.service.ts` — `create()`/`update()` เดิมอ่าน total allocated/balance นอก transaction แล้วเขียนแยก — ห่อเป็น `$transaction` + `SELECT ... FOR UPDATE`
- `backend/src/features/transactions/transaction.service.ts` — เช่นเดียวกันสำหรับ `create()`/`update()` เช็คงบเดี่ยว
- `backend/src/features/transfers/transfer.service.ts` — เช่นเดียวกันสำหรับ `create()` เช็ค fromBudget
- `frontend/src/hooks/usePoolBudget.ts` — `usePoolContribute`/`usePoolReverseContribution` ไม่เคย invalidate query key `['budgets']` ทำให้ UI ค้างเลขเก่าหลัง contribute — เพิ่ม invalidate

**`6aa0a06` — แก้บั๊กที่เจอจาก concurrency test จริงหลัง `b10eb70`:**
- ยิง request สร้าง budget 2 อันพร้อมกันจริง (`Promise.all`) พบว่า `SELECT ... FOR UPDATE` ใน `b10eb70` ยังไม่พอ — budget แถวใหม่ที่ INSERT ใน transaction หนึ่ง มองไม่เห็นจาก transaction คู่ขนานจนกว่าจะ commit (Postgres phantom-read) ทำให้ทั้งคู่ผ่าน check พร้อมกันได้จริง (ยืนยันแล้วด้วย test สด: ได้ 201/201 ก่อนแก้)
- แก้โดยเปลี่ยนมาใช้ `pg_advisory_xact_lock(hashtext(userId)::bigint)` เป็น per-user mutex แทนการล็อค row ที่มีอยู่แล้ว — ใน `budget.service.ts` (`create`/`update`) และ `account.routes.ts` (`setup-balance`, ซึ่งเดิมไม่ได้อยู่ใน transaction เลยด้วย)
- ทดสอบซ้ำหลังแก้: 201/400 ทุกครั้ง ทั้งเคส create-vs-create และ create-vs-setup-balance (ข้าม service กัน)
- `transaction.service.ts`/`transfer.service.ts` **ไม่ต้องแก้เพิ่ม** เพราะเช็คแค่ row เดียวที่มีอยู่แล้ว (ไม่มี insert แถวใหม่เข้า aggregate) — ยืนยันด้วย concurrency test เหมือนกันว่าใช้งานได้ถูกต้องตั้งแต่ `b10eb70`

**`98ae8a4` — เตรียม frontend ขึ้น Vercel:**
- `frontend/src/services/api.ts` — เปลี่ยน `??` เป็น `||` สำหรับ `VITE_API_URL` fallback — นี่คือสาเหตุของปัญหา #6 ในรายการด้านบน (`??` เช็คแค่ `null`/`undefined`, ค่า string ว่างจาก `.env.example` ไม่ถูก fallback)
- `frontend/.env.example` — อัปเดตคอมเมนต์ให้ตรงกับ fallback ใหม่ ใส่ URL จริงของ backend เป็นตัวอย่าง

**`2d3dfef` — เปลี่ยน seed account:**
- `backend/prisma/seed.ts` — เปลี่ยน email/name จาก `demo@budgetflow.app` / "Demo User" เป็น `admin@budgetflow.app` / "Admin" ตามที่ผู้ใช้แก้เองใน IDE, ผมแก้ log message บรรทัดสุดท้ายให้ตรงตาม (เดิมยังพิมพ์ email เก่าอยู่หลังเปลี่ยน)
- **ข้อควรระวังที่ยังไม่ได้แก้**: Neon production DB ตอนนี้มี `demo@budgetflow.app` seed ไว้แล้วจากรอบก่อนหน้า (ก่อน commit นี้) ผูกกับ `Account` ที่มี id คงที่ `'demo-account-id'` ถ้ารัน `db:seed` ซ้ำบน production ด้วย script เวอร์ชันใหม่ จะได้ user `admin@budgetflow.app` ใหม่แยกต่างหาก แต่ account/budget เดิม (upsert ด้วย `update: {}` ว่างเปล่า) จะยังผูกกับ user เก่าอยู่ ไม่ได้ย้ายมาให้ user ใหม่ — สรุปคือ **ถ้า re-seed production ตอนนี้ admin user ใหม่จะไม่มี account/budget ติดมาเลย** ต้องจัดการ data migration แยกถ้าจะทำจริง

### ที่ตรวจแล้วพบว่ามีอยู่แล้ว ไม่ต้องแก้ (ระหว่างเตรียม Vercel)

- ไม่มี hardcode localhost/backend URL อื่นใน `frontend/src` (grep ทั้งโฟลเดอร์)
- `frontend/vercel.json` มี SPA rewrite (`/(.*) → /index.html`) อยู่แล้ว ถูกต้อง
- `axios` instance ตั้ง `withCredentials: true` แล้ว (`api.ts`)
- Backend cookie ตั้ง `sameSite: 'none'` + `secure: true` เมื่อ `env.isProduction` แล้ว (`auth.controller.ts`) — มาจาก commit ก่อนหน้า (`24a260e`)
- `.env`/`.env.local` อยู่ใน `.gitignore` ทั้ง root และ `frontend/` แล้ว, ยืนยันด้วย `git ls-files` ว่าไม่มีไฟล์ secret ถูก track

### Technical debt / ข้อสังเกตที่เจอระหว่างตรวจ แต่ยังไม่ได้แก้

- **`render.yaml` `CORS_ORIGIN` ยังเป็น placeholder** (`https://placeholder.vercel.app`) — ตรงกับ todo ที่ผู้ใช้จดไว้แล้ว แต่เพิ่มรายละเอียดเชิงโค้ด: `cors` middleware (`app.ts`) รับ origin เป็น string เดี่ยวเท่านั้น ถ้าต้องการให้ Vercel preview deployment (URL สุ่มต่อ PR) ใช้งานได้ด้วย ต้องแก้โค้ดให้รองรับหลาย origin หรือ regex match `*.vercel.app` ไม่ใช่แค่เปลี่ยนค่า env var เฉยๆ
- **GitHub Actions secrets อาจไม่ sync กับ Neon ตัวใหม่** — `.github/workflows/daily-job.yml` ใช้ `secrets.DATABASE_URL` แยกจาก Render env var คนละที่เก็บ ถ้าเพิ่งเปลี่ยนรหัส Neon (ตาม todo ข้อแรก) ต้องอัปเดต GitHub repo secret ด้วย ไม่งั้น cron รายวัน (budget alert + recurring transaction) จะพังเงียบๆ โดยไม่มีใครสังเกต
- **`pg_advisory_xact_lock(hashtext(userId)::bigint)`** ที่เพิ่งเพิ่มใน `6aa0a06` — `hashtext` เป็น hash 32-bit มีโอกาสชนกันระหว่าง userId คนละคน (ต่ำมากแต่ไม่ใช่ศูนย์) ถ้าชนกันจริงแค่ทำให้ล็อคเกินจำเป็น (performance) ไม่ใช่ correctness bug — ยอมรับได้ในสเกลนี้ แต่ถ้าระบบโตขึ้นมากควรพิจารณา
- **ไม่มี automated test suite** (ไม่มี jest/vitest ผูกกับ `package.json` เลย) — การ verify TOCTOU fix รอบนี้ทำผ่าน manual Node script ยิง concurrent request จริง (เก็บไว้ใน scratchpad ของ session ไม่ได้ commit เข้า repo) ถ้าจะให้ยั่งยืนกว่านี้ควรมี integration test ที่รันจริงใน CI แทนการพึ่ง manual verification ทุกครั้งที่แก้ money-flow logic
- **`seed.ts` มี unused import** (`TransactionType`) และ unused variable (`account`) — เจอตอนแก้ `2d3dfef` เป็นของเดิมอยู่แล้วไม่เกี่ยวกับการแก้รอบนี้ ไม่ได้แตะเพราะนอก scope
- **Render free tier cold start** — สอดคล้องกับ todo ที่จดไว้เรื่อง node-cron ไม่ทำงาน แต่มีผลอีกด้าน: request แรกหลัง spin down 15 นาทีจะช้ามาก (cold start หลายวินาที) ถ้า access token (`JWT_ACCESS_EXPIRES_IN=15m`) หมดอายุพอดีตอน user กลับมาเปิดแอประหว่าง cold start อาจเจอ refresh token race ที่ยังไม่เคยทดสอบกับ cold-start latency จริง

### คำแนะนำสำหรับ deploy ครั้งถัดไป

1. แก้ `CORS_ORIGIN` ให้ตรง Vercel domain จริงก่อน แล้วค่อย verify login ผ่าน frontend จริงอีกรอบ (ไม่ใช่แค่ curl ตรงไป backend)
2. เช็ค GitHub Actions secret `DATABASE_URL` ให้ตรงกับ Neon connection string ปัจจุบันพร้อมกับตอนเปลี่ยนรหัส Neon (todo ข้อแรก) — สองที่ต้องอัปเดตพร้อมกันเสมอ (Render env var + GH secret)
3. ถ้าจะ re-seed production ด้วย `seed.ts` เวอร์ชันใหม่ (`admin@budgetflow.app`) ต้องคิดเรื่อง data migration ของ `demo-account-id` ก่อน ไม่งั้น admin user ใหม่จะไม่มีข้อมูลติดมา
4. ~~พิจารณาเพิ่ม uptime ping~~ — **กลับคำแนะนำนี้แล้ว** ดูรอบ 2026-08-04 ด้านล่าง: ping ทุก ~10 นาทีกิน instance hours เกือบเต็มโควต้า 750 ชม./เดือนของ Render free tier เปลี่ยนไปจัดการ cold start ที่ฝั่ง UX แทน
5. ก่อนแก้ money-flow invariant logic (budget/transaction/transfer) ครั้งต่อไป ควรทดสอบด้วย concurrent request จริงเสมอ ไม่ใช่แค่ typecheck/lint/build ผ่าน — รอบนี้ `SELECT ... FOR UPDATE` ดูถูกต้องตอน review โค้ดเฉยๆ แต่มี concurrency bug จริงที่ manual test เจอ (ดู `6aa0a06`)

---

## รอบ 2026-08-04 — เลิกใช้ keep-alive ping, จัดการ cold start ที่ฝั่ง UX แทน

**เหตุผลของการกลับคำแนะนำ**: `.github/workflows/keep-alive.yml` (เพิ่งแก้ URL ให้ถูกต้องไปเมื่อกี้ในคอมมิตก่อนหน้า) ยิง ping ทุก 10-12 นาที ตลอด 24 ชม. ตกราวๆ 700+ instance-hours/เดือน ซึ่งชนกับโควต้า free tier ของ Render ที่ 750 ชม./เดือนพอดี (ทุก service ในบัญชีรวมกัน ไม่ใช่แยกต่อ service) — ตัดสินใจว่าไม่คุ้มที่จะกิน quota เกือบเต็มเพื่อแก้ cold start จึงเปลี่ยนมายอมรับว่า cold start จะเกิดขึ้นได้ แล้วบอก user ตรงๆ แทน

### ไฟล์ที่แก้

- **ลบ `.github/workflows/keep-alive.yml`** — ไม่ ping Render อีกต่อไป
- `.github/workflows/daily-job.yml` — ตรวจแล้ว **ไม่ต้องแก้**: ไม่ได้ curl ไป Render URL เลย รันผ่าน `actions/checkout` + `npm run job:daily` ตรงๆ ในตัว GitHub Actions runner (เชื่อม DB ตรงผ่าน `DATABASE_URL` secret) ไม่เกี่ยวกับ backend instance บน Render จึงไม่มี placeholder URL ให้แก้ และยังจำเป็นต้องมีอยู่ (budget alert + recurring transaction cron — ดูเหตุผลเดิมที่ `ENABLE_IN_PROCESS_CRON` ไม่ได้ตั้งบน Render)
- `frontend/src/services/api.ts` — export `API_BASE_URL` ให้ import ซ้ำได้ (เดิม module-scope เข้าไม่ถึงจากไฟล์อื่น), เพิ่ม `timeout: 60000` ใน axios instance (เดิมไม่มี timeout เลย จะรอเฉยๆ จนกว่า browser จะตัดเองซึ่งบางเบราว์เซอร์ไม่ตัดเลย)
- `frontend/src/services/warmup.ts` (ไฟล์ใหม่) — `warmUpBackend()` ยิง `fetch` แบบ fire-and-forget (catch เงียบ ไม่ log) ไปที่ `{API_BASE_URL ตัด /api/v1 ออก}/health` เพื่อเริ่มปลุก backend ตั้งแต่ผู้ใช้เปิดเว็บ ก่อนที่จะกด login ด้วยซ้ำ
- `frontend/src/App.tsx` — เรียก `warmUpBackend()` ใน `useEffect` แยกต่างหาก (mount ครั้งเดียว, deps `[]`) แยกจาก effect เดิมที่ apply theme
- `frontend/src/hooks/useWakeServerNotice.ts` (ไฟล์ใหม่) — hook รับ `isPending: boolean`, ถ้า pending ต่อเนื่องเกิน 3 วินาทีจะโชว์ `toast.loading(...)` (ข้อความไทย, id คงที่ `wake-server` กันซ้อน) ใช้ `react-hot-toast` ที่มีอยู่แล้วในโปรเจกต์ ไม่เพิ่ม dependency ใหม่ — dismiss อัตโนมัติทันทีที่ `isPending` เป็น false (กันไม่ให้ loading toast ค้างทับ success/error toast ของ `useLogin`/`useRegister`)
- `frontend/src/features/auth/LoginPage.tsx`, `RegisterPage.tsx` — เรียก `useWakeServerNotice(login.isPending)` / `useWakeServerNotice(register.isPending)` เพราะเป็นสองหน้าที่มี API call แรกของ session จริงๆ (หน้าอื่นหลัง login ไปแล้ว backend มักตื่นแล้วจาก request login/warmup ก่อนหน้า)

### ตรวจแล้ว

- `cd frontend && npm run build` ผ่าน (tsc + vite build, PWA precache ปกติ) — warning เรื่อง chunk size >500kB เป็นของเดิม ไม่เกี่ยวกับรอบนี้
- `warmUpBackend()` คำนวณ URL จาก `API_BASE_URL.replace(/\/api\/v1\/?$/, '')` แทนที่จะ hardcode host แยก เพื่อให้ตรงกับ backend เดียวกับที่ axios ยิงจริงเสมอ ไม่ต้องซิงค์ env var สองที่

### ยังไม่ได้ทำ / ข้อสังเกต

- ไม่ได้ใส่ wake-notice ในหน้าอื่นนอกจาก Login/Register — ถ้าพบว่า user เปิดแอปทิ้งไว้นานจน token หมดอายุพอดีตอน backend หลับ (ดู "Render free tier cold start" ในหมายเหตุก่อนหน้า, ยังไม่เคยทดสอบจริง) ค่อยพิจารณาเพิ่มใน `AppLayout` หรือจุดที่ silent-refresh เกิดขึ้น
- ยังไม่ได้ลบ instance-hours ที่ใช้ไปแล้วจาก keep-alive เดิม (ข้อมูลนี้อยู่ฝั่ง Render dashboard เท่านั้น ไม่ใช่สิ่งที่แก้ผ่านโค้ดได้)

---

## รอบ 2026-08-04 (ต่อ) — แก้ `setup-balance` 404 (seed.ts data bug)

**อาการ**: user รายงานว่า `POST /accounts/setup-balance` ตอบ 404 บน production

**ตรวจแล้วพบว่าไม่ใช่ routing bug**: ยิง curl ตรงไป `https://budgetflow-wpdg.onrender.com/api/v1/accounts/setup-balance` แบบไม่มี token ได้ **401** `"No token provided"` (ไม่ใช่ 404) — พิสูจน์ว่า route ถูก mount ถูกต้อง จากนั้น login ด้วย `admin@budgetflow.app` (account จริงบน production) แล้วยิง `GET /accounts` ได้ `{"accounts": []}` — user นี้ไม่มี account เลย ทำให้ route โยน 404 ที่ตัวเองมี guard ไว้อยู่แล้ว (`account.routes.ts`: `if (!account) throw ... status: 404` เมื่อหา default account ไม่เจอ)

**Root cause**: `seed.ts` เดิม `prisma.account.upsert({ where: { id: 'demo-account-id' }, update: {}, ... })` — เมื่อเปลี่ยน seed target email จาก `demo@budgetflow.app` เป็น `admin@budgetflow.app` (commit `2d3dfef`) แล้วรัน seed ซ้ำ แถว `demo-account-id` ที่มีอยู่แล้ว (ผูกกับ user เก่า) ไม่ถูกอัปเดต `userId` ให้ตรงกับ user ใหม่เลย เพราะ `update: {}` เป็น no-op — ตรงกับความเสี่ยงที่เคยจดไว้แล้วในบันทึกของ commit `2d3dfef` ด้านบนแต่ไม่เคยแก้จริง

**Fix (commit `9e145b9`)**: `backend/prisma/seed.ts` เปลี่ยน `update: {}` → `update: { userId: user.id }` — ทำให้ seed รันซ้ำกี่ครั้งก็ rebind account ให้ user เป้าหมายปัจจุบันเสมอ

**สิ่งที่ยังไม่ได้ทำ**: แก้แค่โค้ด `seed.ts` เท่านั้น — **data จริงบน production ยังไม่ถูกแก้** (admin user ยัง `accounts: []` อยู่จนกว่าจะรัน `npm run db:seed` จริงบน production) เพราะ Render build command (`npm ci && npm run build && npm run db:migrate:prod`) รันแค่ `prisma migrate deploy` ไม่รัน seed ให้ ต้องรันมือ:

```powershell
cd backend
$env:DATABASE_URL = "<production DATABASE_URL จาก Render dashboard → Environment>"
npm run db:seed
Remove-Item Env:\DATABASE_URL
```

ตรวจแล้ว: `tsx prisma/seed.ts` (คำสั่งจริงเบื้องหลัง `db:seed`) **ไม่** auto-load `.env` เอง (ทดสอบด้วย `npx tsx -e "console.log(!!process.env.DATABASE_URL)"` แบบไม่ set อะไรได้ `false`) — ต้อง set `DATABASE_URL` เองเสมอเวลารันตรงๆ แบบนี้ ไม่พึ่งพา auto-load ใดๆ

**ไม่ต้อง clear browser localStorage**: `budgetflow-auth` เก็บแค่ `{ user, accessToken, isAuthenticated }` ไม่มี account/budget data ติดมา และ accounts/budgets ฝั่ง frontend ดึงสดผ่าน TanStack Query ทุกครั้งที่โหลดหน้า (ไม่ persist) ส่วน PWA service worker cache ใช้ `NetworkFirst` (ลองยิง network ก่อนเสมอ) เพราะงั้น refresh หน้าเปล่าธรรมดาก็เห็นผลลัพธ์ใหม่ทันที ไม่ต้อง logout/clear storage

**ผลข้างเคียงที่ต้องรู้ก่อนรัน seed จริง**: `seed.ts` ไม่ได้แก้แค่ account — ยังมี budget upsert (`findFirst`-or-`create`, idempotent) และ import rule upsert (unique by keyword, idempotent) ถ้า admin user ปัจจุบันยังไม่มี budget เลย รัน seed จะสร้าง 7 budget ตัวอย่าง (Food & Dining ฿6,000 ฯลฯ) ติดมาด้วย ควรเช็ค `GET /budgets` ก่อนถ้าไม่อยากได้ข้อมูลตัวอย่างติดมา

---

## รอบ 2026-08-10 — Public login page เคยชี้ไปหา account สิทธิ์ ADMIN

**อาการ**: `LoginPage.tsx` โชว์ hint credential ค้างมาตั้งแต่ก่อน commit `2d3dfef` reseed เป็น `demo@budgetflow.app` (login ไม่ได้จริง เพราะ user นั้นถูกเปลี่ยนเป็น `admin@budgetflow.app` ไปแล้ว) ระหว่างแก้ hint ให้ตรงกับ seed จริง (commit `c915a24`) พบว่าค่าที่ "ถูกต้อง" ตอนนั้นคือ `admin@budgetflow.app` — เท่ากับ commit นั้นทำให้หน้า login สาธารณะ (Vercel, auto-deploy on push) โชว์ credential ที่ login แล้วได้สิทธิ์ ADMIN จริง (`/admin/*` — list/create/update/delete user คนอื่นได้) **แย่กว่าก่อนแก้** (ก่อนหน้านั้น hint ผิดจน login ไม่ได้เลย ปลอดภัยโดยบังเอิญ)

**Mitigation ทันที (ทำแล้วก่อนแก้โค้ด)**: เจ้าของ account เปลี่ยนรหัส `admin@budgetflow.app` เองผ่าน Settings → Change Password (`POST /auth/change-password`) — ตัดปัญหา credential ที่อาจหลุดไปแล้วจากตอน hint ผิด ก่อนจะแก้ seed/UI

**Fix**: แยก `seed.ts` เป็นสอง user แทนที่จะมี user เดียวทำหน้าที่ทั้งสองอย่าง
- `admin@budgetflow.app` (ADMIN) — private ใช้งานจริง ไม่โชว์ใน UI ไหนเลย password มาจาก `SEED_ADMIN_PASSWORD` (ตั้งใน `.env`) แต่ตั้งเฉพาะตอน `create` เท่านั้น — re-seed ไม่มีทางเขียนทับรหัสที่เปลี่ยนเองผ่าน Settings ไปแล้ว account lookup เปลี่ยนจาก upsert-by-fixed-id เป็น `findFirst({userId, isDefault}) ?? create()` (ของเดิมคือต้นตอบั๊ก `demo-account-id` ด้านบน — เปลี่ยนมาใช้ pattern เดียวกับ budget loop ที่ปลอดภัยกว่า)
- `demo@budgetflow.app` (USER) — public ตั้งใจ โชว์ใน `LoginPage.tsx` จริง password คงที่ `Password123!` **enforce ทุกครั้งที่ seed รัน** (ต่างจาก admin) เพื่อกัน legacy row จากก่อน `2d3dfef` (ถ้ายังหลงเหลืออยู่บน production) มี role/password เพี้ยนไปจากที่ hint โฆษณาไว้ — มี account/budgets/transactions ตัวอย่างมาด้วย (คำนวณ balance/spentAmount มือ เพราะ seed insert ตรงผ่าน Prisma ไม่ผ่าน `TransactionService` เลยไม่มี side-effect อัตโนมัติ)

**Test ใหม่**: `backend/src/middleware/__tests__/admin.middleware.test.ts` — unit test ตรง `requireAdmin` middleware (role USER ต้องโดน 403 บล็อก, role ADMIN ผ่าน) ไม่ต้องพึ่ง DB เลย

**คำสั่ง apply บน production Neon**:

```powershell
cd backend
$env:DATABASE_URL = "<production DATABASE_URL จาก Render dashboard>"
$env:SEED_ADMIN_PASSWORD = "<รหัสใหม่ ถ้าต้องการ>"   # ไม่มีผลกับ admin ที่มีอยู่แล้ว ดูหมายเหตุ
npm run db:seed
Remove-Item Env:\DATABASE_URL
Remove-Item Env:\SEED_ADMIN_PASSWORD
```

**หมายเหตุสำคัญ**: production มี `admin@budgetflow.app` อยู่แล้ว (เจ้าของเปลี่ยนรหัสเองแล้วผ่าน Settings ก่อนหน้านี้) → seed จะเข้า branch `update` เสมอ → **`SEED_ADMIN_PASSWORD` จะไม่มีผลอะไรกับ production เลย** (ตามที่ตั้งใจออกแบบ) สิ่งที่ seed รอบนี้จะทำจริงบน production คือสร้าง `demo@budgetflow.app` ใหม่พร้อมข้อมูลตัวอย่างเท่านั้น — ข้อมูลเดิมของ admin (account/budgets/transactions จริงทั้งหมด) ไม่ถูกแตะเลย ยืนยันแล้วด้วยการรัน seed ซ้ำ 2 รอบ local ว่า idempotent จริง (ไม่มี duplicate, balance ไม่ถูกบวกซ้ำ)

**ต้องทำหลัง deploy**: อย่าลืมเปลี่ยน `LoginPage.tsx` hint (commit นี้) ต้องขึ้น production จริงด้วย ไม่ใช่แค่ backend seed — ทั้งสองฝั่งต้องขึ้นพร้อมกัน ไม่งั้นหน้า login จะยังโฆษณา credential เก่าอยู่

---

## รอบ 2026-08-14 — Borrow-from-budget (Phase 1+2) ขึ้น production

**Commits**: `9931fa3` (Phase 1+2 หลัก — schema `TransactionSplit`, service logic, `BorrowBudgetModal`), `1d6097f` (fix: badge→detail line มือถือ hover ไม่ได้) — push ขึ้น `main` แล้วทั้งคู่

**Migration**: `20260814060819_add_transaction_splits` — ยืนยันแล้วว่า pure additive (`CREATE TABLE transaction_splits` + 2 index + 2 FK constraint เท่านั้น ไม่มี `ALTER` ตารางเดิมสักบรรทัด) Render build command เดิม (`npm ci && npm run build && npm run db:migrate:prod`) รัน `prisma migrate deploy` เองตาม flow ปกติ ไม่ต้องรันมือ

**Seed**: **ไม่ต้องรัน** `db:seed` ใหม่ — ไม่ได้แก้ `seed.ts` เลยรอบนี้ ตาราง `transaction_splits` เริ่มว่างเปล่าเองตามธรรมชาติ (populate เฉพาะตอนมี borrow เกิดขึ้นจริงผ่าน UI)

**Deploy flow ที่ใช้จริง**: push → main → Render redeploy อัตโนมัติ (migration รันใน build command), Vercel redeploy อัตโนมัติ (auto-deploy on push ตาม config เดิม) — ไม่ต้องแตะ Render/Vercel dashboard เลยรอบนี้ ต่างจากรอบ 2026-08-03/08-04/08-10 ก่อนหน้าที่ต้องรัน seed มือ

**ทดสอบ**: local dev เท่านั้น (browser จริง, golden path + empty-state + cancel-keeps-data + edit-drops-split + concurrency test) — **ยังไม่ได้ทดสอบบน production จริง** โดยเฉพาะ mobile viewport ของ `BorrowBudgetModal` และบรรทัดรายละเอียด split ใน `TransactionsPage` (เครื่องมือ browser automation ที่ใช้ resize ไม่ mirror ไปที่ screenshot ในเครื่อง dev — ยืนยันแค่ผ่าน DOM query ว่า markup ถูกต้อง ไม่ใช่เห็นด้วยตาจริง) — user จะเทสเองบน production ก่อนสั่ง Phase 3 ต่อ

**ที่ต้องเตรียมก่อน Phase 3** (ดูรายละเอียดสรุป scope เต็มใน `CLAUDE.md` § "Monthly Reset + Borrow-from-budget — แผนงาน Phase 3/4"):
- `docker start budgetflow-db` (มีทั้ง `budgetflow` + `budgetflow_test` อยู่แล้วในตัว container เดียว)
- Neon branch `backup-before-phase3` สำหรับ rollback ก่อนแตะ production schema รอบใหญ่ (Phase 3 เพิ่ม column บน `Budget` ตารางที่มีข้อมูลจริงอยู่แล้ว ต่างจาก Phase 1+2 ที่เป็นตารางใหม่ล้วนความเสี่ยงต่ำกว่า)
