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

## ที่ยังค้างอยู่

- [ ] เปลี่ยนรหัส Neon (หลุดใน chat ระหว่าง debug) แล้วอัปเดต `DATABASE_URL` ใน Render
- [ ] แก้ `CORS_ORIGIN` ใน Render ให้ตรงกับ Vercel production domain จริง (ตอนนี้ยังเป็น placeholder `https://placeholder.vercel.app` ใน `render.yaml`)
- [ ] เปลี่ยน demo account เป็น email/name ที่เหมาะสมกว่า (เริ่มทำแล้วบางส่วน — ดู commit `2d3dfef`)
- [ ] node-cron ไม่ทำงานจริงบน Render free tier (spin down 15 นาที) — พึ่ง GitHub Actions แทน
- [ ] `uploads/` เป็น ephemeral ไฟล์หายทุก deploy

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
4. พิจารณาเพิ่ม uptime ping (เช่น cron-job.org / UptimeRobot ยิง `/health` ทุก ~10 นาที) ถ้าไม่อยากให้ Render free tier spin down บ่อย — แลกกับ free tier compute hours ที่จะใช้เพิ่ม
5. ก่อนแก้ money-flow invariant logic (budget/transaction/transfer) ครั้งต่อไป ควรทดสอบด้วย concurrent request จริงเสมอ ไม่ใช่แค่ typecheck/lint/build ผ่าน — รอบนี้ `SELECT ... FOR UPDATE` ดูถูกต้องตอน review โค้ดเฉยๆ แต่มี concurrency bug จริงที่ manual test เจอ (ดู `6aa0a06`)
