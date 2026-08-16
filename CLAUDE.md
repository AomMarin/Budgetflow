# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BudgetFlow — zero-based budgeting app ("every baht has a purpose"). Full-stack TypeScript monorepo with separate `backend/` and `frontend/` workspaces.

**Demo account:** demo@budgetflow.app / Password123! (USER role, public — shown on the login page)

`prisma/seed.ts` also creates a separate `admin@budgetflow.app` (ADMIN role) for private/real use. It is never shown in the UI and its password is not seeded — set `SEED_ADMIN_PASSWORD` before the first seed run in any shared environment, or change it via Settings after login. Re-seeding never touches an admin password that already exists.

---

## Commands

### Backend (`cd backend`)

```bash
npm run dev          # Start dev server with hot-reload (tsx watch) on port 3001
npm run build        # Compile TypeScript to dist/
npm run lint         # ESLint src/**/*.ts
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier
npm run test         # Run unit tests once (vitest, needs local budgetflow_test DB — see Testing below)
npm run test:watch   # Same, watch mode

# Database
npm run db:migrate   # Run pending Prisma migrations (dev)
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio (GUI)
npm run db:generate  # Re-generate Prisma client after schema changes
```

### Frontend (`cd frontend`)

```bash
npm run dev          # Vite dev server on port 5173 (proxies /api → 3001)
npm run build        # tsc + vite build
npm run lint         # ESLint src/**/*.{ts,tsx}
npm run format       # Prettier
npm run test         # Run unit tests once (vitest — pure functions only, no DB)
npm run test:watch   # Same, watch mode
```

### Required `.env` (backend)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/budgetflow
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
```

### Testing — one-time setup

Backend unit tests (`backend/src/**/__tests__/*.test.ts`) exercise real services against a **real, separate** Postgres database named `budgetflow_test` — never the dev/prod database. `backend/src/test/setup.ts` throws immediately if `DATABASE_URL` doesn't contain `_test`, so a misconfigured `.env.test` fails loudly instead of silently touching real data. Frontend unit tests (`frontend/src/**/__tests__/*.test.ts`) only cover pure functions (e.g. `utils/allocation.ts`) and need no database.

**1. Get a local Postgres with a `budgetflow_test` database.** If you don't already run Postgres locally, the fastest path is a disposable Docker container:

```bash
docker run -d --name budgetflow-test-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=budgetflow_test \
  -p 5432:5432 \
  postgres:16
```

(Reuse later with `docker start budgetflow-test-pg` / stop with `docker stop budgetflow-test-pg`. If you already run Postgres on 5432 some other way, just create a `budgetflow_test` database in it instead — no container needed.)

**2. Create `backend/.env.test`** by copying `backend/.env.test.example` (gitignored, same as `.env` — never committed):

```bash
cp backend/.env.test.example backend/.env.test
```

Adjust `DATABASE_URL` only if your Postgres credentials/port differ from the Docker command above.

**3. Migrate the test database:**

```bash
cd backend && npm run test:db:migrate   # prisma migrate deploy, loaded from .env.test
```

**4. Run tests:**

```bash
cd backend && npm run test    # or test:watch
cd frontend && npm run test   # or test:watch
```

Backend tests create/delete their own `test-<uuid>@budgetflow.test` users per test (see `src/test/helpers.ts`) and clean up in `afterEach`, so the suite is safe to re-run without resetting the database.

API docs available at `http://localhost:3001/api/v1/docs` (Swagger UI) when running dev.

---

## Architecture

### Backend — Clean Architecture layers

```
Controller → Service → Repository → Prisma Client
```

Every feature module under `src/features/<feature>/` has the same four-file shape:
`*.routes.ts` → `*.controller.ts` → `*.service.ts` → `*.repository.ts`

The controller only calls the service and uses `sendSuccess()`/`sendCreated()` from `src/utils/response.ts`. Business logic lives exclusively in the service. Database queries live exclusively in the repository.

**Auth flow:** JWT access token (15 min, Bearer header) + refresh token (7 days, httpOnly cookie). The `authenticate` middleware (`src/middleware/auth.middleware.ts`) attaches `req.user = { id, email, name }` — cast the request to `AuthenticatedRequest` to access it.

**Route-level validation:** `express-validator` chains defined in `*.validation.ts`, applied via `validate` middleware before the controller. Backend throws errors as `Object.assign(new Error(msg), { status: 400 })` which the global error middleware picks up.

**All API responses** wrap in `{ success, data, message, meta }` — never send raw data directly.

### Frontend — Feature-based React SPA

**State:** TanStack Query for all server state (query keys: `['budgets']`, `['accounts']`, `['dashboard']`, `['transfers']`). Zustand for auth (`useAuthStore`, persisted to localStorage as `budgetflow-auth`) and theme (`useThemeStore`).

**API client:** `src/services/api.ts` — Axios instance with base URL `/api/v1`. Vite proxies `/api` → `localhost:3001` so no CORS in dev. The interceptor handles silent token refresh; on failure it calls `logout()` and redirects to `/login`.

**Path alias:** `@/` maps to `frontend/src/`.

**Hooks pattern:** All data fetching lives in `src/hooks/` (`useBudgets`, `useDashboard`, etc.) which wrap TanStack Query. Mutations invalidate relevant query keys on success and call `toast.success/error`.

### Pages and routes

| Route | Component | Purpose |
|---|---|---|
| `/dashboard` | `DashboardPage` | Overview: total balance, monthly income/expense, recent transactions, budget alerts |
| `/budgets` | `BudgetsPage` | Budget buckets CRUD, income allocation modal, reorder |
| `/transactions` | `TransactionsPage` | Transaction list with filters (type, budget, date, search) |
| `/transfers` | `TransfersPage` | Move allocated funds between budget buckets |
| `/reports` | `ReportsPage` | Spending charts by budget |
| `/import` | `ImportsPage` | CSV upload + import rule management |
| `/settings` | `SettingsPage` | Account setup, recurring transactions |

Auth routes (`/login`, `/register`) are guest-only; all others require auth via `RequireAuth` wrapper in `App.tsx`.

---

## Domain Model (critical invariants)

**Zero-based budgeting constraint:** `Σ Budget.allocatedAmount ≤ Σ Account.balance`. Enforced in `budget.service.ts` `create()` and `update()` — never bypass this check.

**Budget fields:**
- `allocatedAmount` — total earmarked for this bucket (increases on income allocation or manual edit)
- `spentAmount` — total actually spent (increases on EXPENSE transaction linked to this budget)
- `remainingAmount` = `allocatedAmount - spentAmount` (computed, not stored)

**Two money flows that DO NOT affect Account balance:**
1. `Transfer` — moves `allocatedAmount` between budgets (debits source `spentAmount`, credits destination `allocatedAmount`)
2. Budget `allocatedAmount` manual edit — does NOT touch account balance; only income recording via `/budgets/allocate` changes both simultaneously

**Income recording (`POST /budgets/allocate`):** Atomically creates a Transaction (INCOME), increments `Account.balance`, and increments each target `Budget.allocatedAmount`. The sum of per-budget allocations must not exceed the income amount.

**Transaction side-effects (handled in `transaction.service.ts`):**
- EXPENSE → decrements `Account.balance` + increments `Budget.spentAmount`
- INCOME → increments `Account.balance` (no budget effect — use allocate endpoint for budget distribution)
- Editing/deleting a transaction must reverse the original side-effect before applying the new one.

**Budget deletion:** If a budget has any transactions it gets archived (`isArchived: true`) instead of hard-deleted. Archived budgets are excluded from `findAll` but remain for historical data.

**CSV import:** `ImportService.upload()` processes the file asynchronously. It applies `ImportRule` keyword-matching (by priority) to auto-categorize rows into budgets. Unmatched rows land with `budgetId: null`.

---

## Current State & Feature Log

สถานะล่าสุดของโปรแกรม และสิ่งที่ได้ implement ไปแล้ว ให้ Claude อ่านก่อนเริ่มงานใหม่เพื่อเข้าใจ context

### Features ที่ implement แล้ว

#### 1. Zero-based budget enforcement (Backend + Frontend)
- **Backend** `budget.service.ts` `create()` / `update()`: ตรวจสอบว่า `allocatedAmount` รวมกันทุก budget ต้องไม่เกิน `Σ Account.balance` — โยน 400 ถ้าเกิน
- **Frontend** `BudgetForm.tsx`: แสดง hint "จัดสรรได้อีก: ฿X" ใต้ช่อง amount และ disable ปุ่ม submit ถ้าเกิน

#### 2. Transfer over-remaining prevention
- **Frontend** `TransfersPage.tsx` `TransferForm`: disable ปุ่ม Transfer เมื่อ `amount > fromBudget.remainingAmount`
- Backend ตรวจสอบซ้ำอีกชั้น

#### 3. Expense exceeds budget remaining — redirect to transfer (Backend + Frontend)
- **Backend** `transaction.service.ts` `create()`: ถ้า type=EXPENSE และ budgetId ระบุไว้ ตรวจ `amount > (allocatedAmount - spentAmount)` โยน 400 พร้อมข้อความภาษาไทย `"งบ "${name}" ไม่พอ — เหลือ X บาท ขาด Y บาท กรุณาโยกงบจากกลุ่มอื่นก่อน"`
- **Backend** `transaction.service.ts` `update()`: เช่นเดียวกัน โดยคิด `effectiveRemaining = currentRemaining + oldContribution` กรณีแก้ไข transaction ในงบเดิม
- **Frontend** `TransactionForm.tsx`:
  - Budget dropdown แสดงยอดคงเหลือทุก option: `🍔 Food & Dining — เหลือ ฿5,570`
  - Hint ปกติ: "คงเหลือในงบนี้: ฿X" แสดงใต้ dropdown
  - Warning banner สีเหลือง เมื่อ amount > budget.remainingAmount พร้อมปุ่ม "ไปที่หน้าโยกงบ →" (`useNavigate` ไป `/transfers`)
  - Submit button disabled ตลอดเมื่องบไม่พอ

#### 4. Mobile responsive layout
- **`Sidebar.tsx`**: `hidden md:flex` — ซ่อนบนมือถือ
- **`BottomNav.tsx`** (ไฟล์ใหม่): Bottom navigation bar 5 ปุ่ม (หน้าหลัก, งบ, รายการ, โยกงบ, ตั้งค่า) แสดงเฉพาะ `md:hidden` พร้อม active highlight
- **`AppLayout.tsx`**: main padding `p-4 md:p-8`, `pb-24 md:pb-8` เว้นที่ให้ bottom nav
- **`Header.tsx`**: mobile แสดง BudgetFlow logo + brand name แทน page title
- **`Modal.tsx`**: mobile เป็น bottom-sheet (`items-end`, `rounded-t-2xl`, `max-h-[80vh] overflow-y-auto`)
- **`TransactionsPage.tsx`**: mobile แสดง card list แทน table เพื่อไม่ต้อง scroll นอน
- **`vite.config.ts`**: เพิ่ม `host: true` เพื่อให้เข้าถึงจากมือถือบน WiFi เดียวกันได้

#### 5. Notifications + automation (real cron, ไม่ต้องพึ่ง dashboard mount)
- **Schema**: `Notification` model + `NotificationType` enum (BUDGET_ALERT, RECURRING_PROCESSED), `Budget.lastAlertedLevel` (Int?) สำหรับ dedup
- **Backend** `src/features/notifications/` (routes/controller/service/repository/dto มาตรฐาน 4 ไฟล์): `GET /notifications`, `GET /notifications/unread-count`, `PATCH /:id/read`, `PATCH /read-all`
- **Backend** `budget.service.ts` `checkAlerts(userId)`: เทียบ `alertLevel` ปัจจุบัน (reuse `addStats()`) กับ `lastAlertedLevel` ที่เก็บไว้ — แจ้งเตือนเฉพาะตอน level สูงขึ้น, reset เป็น null เมื่อ usage ลดกลับต่ำกว่า 80% (กันแจ้งซ้ำ)
- **Backend** `src/jobs/daily.job.ts` + `run-daily.ts`: วนทุก user เรียก `RecurringService.process()` (ของเดิม, reuse) + `notifyBudgetAlerts()` (`src/utils/budget-alerts.ts`, wrap `BudgetService.checkAlerts()`) แล้วสร้าง Notification จริง มี `npm run job:daily` ไว้รันมือ/ทดสอบ — **ตัวจริงที่รันมันทุกวัน**: local dev รันแบบ in-process ผ่าน `node-cron` ใน `server.ts` (00:05 Asia/Bangkok) แต่ถูก gate ไว้หลัง `ENABLE_IN_PROCESS_CRON=true` (ตั้งไว้แล้วใน `.env`/`.env.example`); ใน production (Render) ตัวแปรนี้ไม่ถูกตั้ง ปล่อยให้ GitHub Actions workflow (`.github/workflows/daily-job.yml`) เป็นคนรัน `npm run job:daily` แทนแบบ decoupled จาก Render instance (กันไม่ให้ยิงซ้ำสองที่ และไม่ต้องพึ่งว่า instance ตื่นอยู่หรือเปล่า)
- **Frontend** `NotificationBell.tsx` (แทนกระดิ่งเดิมใน `Header.tsx` ที่ผูกกับ `useDashboard().alerts` แบบไม่ persist) — unread badge, dropdown, mark-as-read, `useNotifications.ts` hook (poll unread-count ทุก 30s)

#### 6. Deep insights (Reports page)
- **Backend** `reports.service.ts` เพิ่ม `getForecast` (คาดการณ์ยอดใช้สิ้นเดือนต่อ budget จาก month-to-date transaction จริง ไม่ใช่ `Budget.spentAmount` เพราะ field นั้น lifetime-cumulative ไม่ reset รายเดือน), `getMonthOverMonth` (เทียบรายรับ/รายจ่าย/เงินออมกับเดือนก่อน), `getRecommendations` (แนะนำโยกงบจาก budget ที่เหลือเยอะไปช่วย budget ที่จะเกิน) รวมเป็น `getInsights` → `GET /reports/insights`
- **Frontend** `ReportsPage.tsx` เพิ่มส่วน insights: stat card เทียบเดือนก่อน, progress bar คาดการณ์งบที่จะเกิน, การ์ดคำแนะนำพร้อมลิงก์ไป `/transfers`

#### 7. PWA (installable)
- **`vite-plugin-pwa`**: manifest + service worker (`registerType: 'autoUpdate'`), workbox `NetworkFirst` cache สำหรับ GET `/api/v1/(dashboard|budgets|accounts|reports)`
- **`public/icon.svg`, `public/favicon.svg`** (ไฟล์ใหม่ — ของเดิมไม่มี public/ dir เลย ลิงก์ favicon เดิมเป็น broken link)

#### 8. Family Budget — household sharing (read-only เท่านั้น)
- ตัดสินใจแล้วว่าทำแบบ **read-only sharing** ไม่ใช่ pooled/shared budget ที่แก้ไขร่วมกันได้ — เพื่อเลี่ยง concurrent-write race condition และไม่ต้องแตะ zero-based invariant เดิม (ยังคิดจาก `userId` เดียวเหมือนเดิมทุกที่)
- **Schema**: `Household` (ownerId), `HouseholdMember` (userId unique — 1 คนอยู่ได้ 1 household), `HouseholdInvite` (code เชิญ หมดอายุ 7 วัน, ไม่มี email infra เลยใช้ shareable code แทน)
- **Backend** `src/features/households/`: create/invite/join(code)/removeMember/leave/deleteHousehold/getOverview — `getOverview` ไม่แตะ repository เดิมเลย แค่เรียก `DashboardService.getSummary(userId)` ซ้ำต่อสมาชิกแต่ละคนแล้วรวมผล (เขียนใหม่ทั้งหมด ไม่กระทบ Account/Budget/Transaction เดิม)
- **Frontend** หน้าใหม่ `src/features/household/HouseholdPage.tsx` (ย้ายออกจาก Settings แล้ว) + เมนู "Family Budget" ใน `Sidebar.tsx` (ยังไม่ใส่ใน BottomNav เพราะเต็ม 5 ปุ่มแล้ว เหมือน Reports/Import/Admin — เข้าถึงได้ทางอื่นบนมือถือแล้ว ดู #9)

#### 10. Borrow-from-budget — Phase 1+2 (deployed, 2026-08-14)

ปัญหาเดิม: EXPENSE เกินงบ → บล็อก + ต้องไปหน้า Transfers โยกงบถาวร (เปลี่ยน `allocatedAmount` ค้างไปเดือนหน้าด้วย) แก้โดยเพิ่ม "ยืม" ที่ไม่แตะ `allocatedAmount` ของทั้งสองงบเลย — เฉพาะ `spentAmount`

- **Schema**: `TransactionSplit` (`transactionId`, `budgetId`, `amount`) — **additive-only**: มี row ก็ต่อเมื่อ transaction นั้น borrow จริง (ส่วนใหญ่ไม่มี row เลย, `Transaction.budgetId` ยังเป็นความจริงหลักเหมือนเดิม) — ประเมินทางเลือกอื่นแล้ว (column คู่บน `Transaction`, หรือ split ทุก transaction เสมอ) เลือกแบบนี้เพราะ blast radius เล็กสุด ไม่ต้องแก้จุดที่ยังอ่าน `Transaction.budgetId` ตรงๆ (dropdown, filter, ImportRule, RecurringTransaction, batchCreate)
- **Backend** `transaction.service.ts`: generalize create/update/delete ให้วนบน splits array (implicit 1-split เมื่อไม่ borrow, unify code path) — lock budget ตามลำดับ `[...new Set([primary, borrow])].sort()` เสมอเมื่อมี borrow (ทั้ง create และ update) กัน deadlock ข้ามกันของ 2 transaction ที่ borrow สลับบทบาทกัน — `batchCreate()` **ไม่รองรับ** borrow (ตัดสินใจแล้ว ดู known gaps ด้านล่าง)
- **Backend** `utils/split-aware-spend.ts` (`getExpenseByBudget`) — ใช้ร่วมกันใน `reports.service.ts` (2 จุด: `getMonthToDateSpendByBudget`, `getMonthlyReport` budgetBreakdown) + `dashboard.service.ts` (`getSpendingByBudget`) — merge สอง query (มี split / ไม่มี split) แทนการ groupBy ตรงๆ
- **Frontend** `BorrowBudgetModal.tsx` (ไฟล์ใหม่) — เด้งตอนกด submit ถ้า EXPENSE เกินงบ (ไม่ redirect ไป Transfers อีกต่อไป) แสดง `รายการ ฿X − งบเหลือ ฿Y = ต้องยืม ฿Z`, list งบอื่นเลือกได้ (พอไม่พอ disable+เหตุผล, ไม่รวมงบตัวเองและงบ archived), ข้อความแยกชัดจาก Transfers ("ครั้งนี้เท่านั้น allocatedAmount ไม่เปลี่ยน"), ไม่มีงบไหนพอ → บอกทางออก (ลดยอด/ไปจัดสรรเพิ่ม) — ซ้อนบน `TransactionForm` โดยไม่ unmount ฟอร์มเดิม (cancel แล้วข้อมูลฟอร์มยังอยู่ครบ, `handleFormClose` กัน Escape ทะลุปิดสองชั้นพร้อมกัน)
- **Frontend** `TransactionsPage.tsx` — บรรทัดรายละเอียด split ใต้ description (เช่น `Shopping ฿1,000 · ยืมจาก Food & Dining ฿50`) แสดงถาวรไม่ต้อง hover (เดิมเคยเป็น badge+tooltip แล้วพบว่ามือถือใช้ไม่ได้ — เปลี่ยนแล้ว) generalize รองรับ borrow หลายงบในอนาคต (join ด้วย comma ไม่ hardcode 2 split)
- **Frontend** `useTransactions.ts` — toast แยกข้อความยืม (ใช้ยอด/ชื่องบจาก API response จริง ไม่เดา), เพิ่ม `['reports']` invalidation ที่หลุดไปก่อนหน้าใน mutation hook ทุกตัว
- **Migration**: `20260814060819_add_transaction_splits` — pure additive (`CREATE TABLE` + 2 index + 2 FK) ไม่แตะตารางเดิม
- **Commits**: `9931fa3` (Phase 1+2 หลัก), `1d6097f` (fix: badge→detail line) — ทั้งคู่ push ขึ้น `main` แล้ว, Render/Vercel auto-deploy ไปแล้ว (migration รันผ่าน `db:migrate:prod` ใน build command เดิม) — **ไม่ต้องรัน seed ใหม่** (ไม่ได้แก้ `seed.ts`)
- **Test**: backend 25/25 ผ่าน (`transaction.borrow.test.ts` ใหม่ 9 เคส รวม concurrency 2 borrow ข้ามกัน) — ทดสอบ live ผ่าน browser จริงครบ golden path/empty-state/cancel-keeps-data/edit-drops-split บน local dev
- **ยังไม่ได้ทดสอบ**: mobile viewport จริง (390px) ของ `BorrowBudgetModal` และบรรทัด split ใน `TransactionsPage` — เครื่องมือ browser automation ที่ใช้ resize ไม่ mirror ไปที่ screenshot ในเครื่องนี้ ยืนยันแค่ผ่าน DOM query ว่า markup/class ถูกต้อง (mirror `Modal.tsx` bottom-sheet pattern เดิมที่ผ่าน production มาแล้ว) — **ยังไม่เคยเห็นด้วยตาบน production จริง**

#### 9. Mobile: keep-alive heartbeat + overflow menu (logout, Reports/Import/Family Budget/Admin)
- **`hooks/useKeepAlive.ts`** (ไฟล์ใหม่): ping `warmUpBackend()` ทุก 10 นาทีระหว่าง session ที่ login อยู่ (`enabled` ผูกกับ `isAuthenticated`) เพื่อกัน Render free tier spin down ที่ 15 นาที — ผูกกับ `visibilitychange`: หยุด ping ทันทีเมื่อแท็บ hidden (`clearInterval`), ping ทันที 1 ครั้ง + เริ่ม interval ใหม่เมื่อกลับมา visible (สำคัญบนมือถือเพราะ browser throttle background timer เองอยู่แล้ว) เรียกที่เดียวใน `AppLayout.tsx` ไม่ผ่าน TanStack Query
- **ปัญหาที่เจอ**: `Sidebar.tsx` เป็นที่เดียวในระบบที่มีปุ่ม logout แต่ตัว `<aside>` เอง `hidden md:flex` — มือถือไม่มีทาง logout เลย, และ Reports/Import/Family Budget/Admin ก็เข้าไม่ถึงเช่นกันเพราะ `BottomNav` มีแค่ 5 ปุ่ม
- **Frontend** `components/layout/UserMenu.tsx` (ไฟล์ใหม่): ปุ่ม avatar `md:hidden` ใน `Header.tsx` เปิด dropdown ก็อป pattern เดียวกับ `NotificationBell.tsx` (state + click-outside ผ่าน ref) แบ่ง 2 ส่วนคั่นด้วย divider — ส่วนบน: nav link ไป Reports/Import/Family Budget (+ Admin เฉพาะ `role === 'ADMIN'`, pattern เดียวกับ `RequireAdmin` ใน `App.tsx`) ปิด dropdown อัตโนมัติหลังกด (`onClick` เซ็ต `isOpen(false)` บน `NavLink` เอง); ส่วนล่าง: ชื่อ/อีเมล + ปุ่มออกจากระบบ (ของเดิมที่มีอยู่แล้ว) — icon ใช้ตัวเดียวกับ `Sidebar.tsx` (`BarChart3`, `Upload`, `Users`, `ShieldCheck`)

### Bug ที่เจอและแก้ระหว่างทาง (ไม่เกี่ยวกับ feature ใหม่)
- **Rate limit ต่ำไป**: `RATE_LIMIT_MAX` เดิม 100 req/15min ต่อ IP ชนกับ dashboard/notification polling จริง ปรับเป็น 1000 ใน `.env`/`.env.example`
- **`reports.service.ts` raw SQL bug**: query เดิมใช้ `WHERE user_id = ...` แต่ column จริงคือ `"userId"` (Prisma ไม่ได้ map field เป็น snake_case) ทำให้ `/reports/monthly` และ `/reports/yearly` 500 error มาตั้งแต่ commit แรก (กราฟ daily spending กับ yearly overview เงียบๆ ไม่เคยขึ้นเลย) — แก้เป็น `WHERE "userId" = ...` แล้ว
- **Public login page เคยชี้ไปหา account ที่มีสิทธิ์ ADMIN**: `LoginPage.tsx` เคยโชว์ hint credential ของ `admin@budgetflow.app` (ตอนแรกโชว์ผิดเป็น `demo@budgetflow.app` เลย login ไม่ได้ ซึ่งบังเอิญปลอดภัยกว่า — พอแก้ hint ให้ตรงกับ seed จริงตอนนั้นคือ admin@ กลับกลายเป็นเปิดให้ public login เข้าสิทธิ์ ADMIN ได้จริง) แก้โดยแยก seed เป็นสอง user: `admin@budgetflow.app` (ADMIN, private, ไม่โชว์ใน UI, password มาจาก `SEED_ADMIN_PASSWORD` ตั้งแค่ตอนสร้างครั้งแรก ไม่เขียนทับตอน re-seed) กับ `demo@budgetflow.app` (USER role, password คงที่ `Password123!` ตั้งใจ public, ค่า role/password ถูก enforce ทุกครั้งที่ seed รันเพื่อกัน legacy row หลุด role) — ดู `DEPLOYMENT.md` สำหรับคำสั่ง apply บน production

### สิ่งที่ยังไม่ได้ทำ / ปรับปรุงได้

- Transaction บนมือถือ ปุ่ม Delete ซ่อนไว้ (มีแค่ Edit) — กด Edit แล้วค่อยลบได้จาก form
- Household ยัง read-only อย่างเดียว — ยังไม่มี shared/pooled budget ที่แก้ไขร่วมกันได้จริง (เคยประเมินไว้ว่าเสี่ยง race condition + ต้องแก้ invariant ทั้งระบบ ถ้าจะทำต้องคุยเรื่อง scope ใหม่)
- Notification เป็น in-app เท่านั้น ยังไม่มี email/push จริง (ไม่มี SMTP/VAPID credentials)
- Cron รันครั้งเดียวต่อวันตาม timezone เดียว (Asia/Bangkok) ไม่ได้ปรับตาม `User.timezone` ของแต่ละคน
- `recurring.service.ts`/`import.service.ts` ไม่ผ่าน `TransactionService` เลย (เขียน side-effect เอง) — **ไม่มี budget-insufficient check, ไม่ lock แถว** ต่างจาก `transaction.service.ts` create/update — เป็น gap เดิมตั้งแต่ก่อน Borrow feature ไม่ใช่ regression ใหม่ พึ่ง `notifyBudgetAlerts` แจ้งย้อนหลังแทน ยังไม่ตัดสินใจว่าจะให้ borrow เข้าถึง path นี้ด้วยไหม
- `batchCreate()` (transaction batch entry) ไม่รองรับ borrow — เกิน budget ใน batch row ยัง throw `BUDGET_INSUFFICIENT` เดิม (ตัดสินใจแล้วว่าตัด scope ตรงๆ เพราะ batch ไม่มี per-row UI ให้เลือก borrow source)
- `budget.service.ts` `delete()` ไม่เรียก `lockUser` — ไม่อยู่ใน advisory-lock family เดียวกับ `create()`/`update()`/`closeAndAdvancePeriodsForUser()` (พบระหว่าง code review ก่อน deploy Phase 3, 2026-08-16) ถ้า user ลบ budget พร้อมกับที่ `closeAndAdvancePeriodsForUser()` กำลังประมวลผล budget นั้นพอดี (race แคบมาก) close จะ throw ตอนหา row ไม่เจอแล้ว rollback ทั้ง transaction — **fail-safe ไม่ corrupt ข้อมูล แค่ต้อง retry** เป็น reliability gap ไม่ใช่ money bug ตัดสินใจแล้วว่าไม่ต้องแก้ตอนนี้
- Money math ทั้ง codebase ใช้ `Number(prisma.Decimal)` (JS float) ไม่ใช่ Decimal.js arithmetic ตรงๆ — ตรวจแล้วตอน review Phase 3 (2026-08-16) ว่าเป็น pattern เดิมทั่วทั้ง codebase ไม่ใช่สิ่งที่ Phase 3 เพิ่มเข้ามาใหม่ ปลอดภัยในทางปฏิบัติเพราะคอลัมน์ DB เป็น `Decimal(15,2)` ปัดเศษให้ตอนเขียนอยู่แล้ว (float error จากบวก/ลบเงิน 2 ทศนิยมเล็กกว่า rounding threshold มาก) ตัดสินใจไม่แก้ตอนนี้เพราะ scope ใหญ่เกินงานปัจจุบัน — **ถ้าวันไหนเจอปัญหาปัดเศษเงินจริง ให้เริ่มดูจากจุดนี้เป็นจุดแรก**

### Monthly Reset + Borrow-from-budget — แผนงาน Phase 3/4 (โค้ดเขียนแล้ว, ยัง apply Neon ไม่ได้)

Design doc ร่างแรกทำไว้ตอน plan mode วันที่ 2026-08-14 แล้วพบว่า **RESET/ROLLOVER เดิมละเมิด zero-based invariant** ระหว่าง session ตรวจทานถัดมา (2026-08-14 เช่นกัน) แก้ design ใหม่ทั้งคู่แล้ว — เวอร์ชันนี้คือ design ที่ยืนยันแล้ว, สรุปไว้ที่นี่ให้ self-contained. Session ถัดมา (2026-08-16) เขียนโค้ดครบตาม design นี้แล้วทั้งหมด (ดู **สถานะ** ท้ายหัวข้อนี้) — เนื้อหา design ด้านล่างยังคงถูกต้อง อ่านเป็น reference ของสิ่งที่ implement ไปแล้วได้เลย ไม่ใช่แผนที่ยังไม่เริ่ม.

**บั๊กที่เจอ (เหตุผลที่ design เดิมถูกทิ้ง)**: `spentAmount` หักออกจาก `Account.balance` ถาวรตอน expense เกิด เงินไม่มีทางย้อนคืนได้แค่ zero counter — ตัวอย่างตัวเลขจริงที่จับได้ (balance 8,400 / allocated 10,000 / spent 3,300, remaining เดิม 6,700 ≤ balance ✓):
- RESET เดิม (spent=0, allocated ไม่แตะ) → remaining ใหม่ 10,000 > balance 8,400 ✗ เสกเงิน 1,600
- ROLLOVER เดิม (allocated += remaining) → remaining ใหม่ 16,700 ✗ หนักกว่าอีก
- SWEEP (spent=0, allocated=0) → remaining ใหม่ 0 ✓ ปลอดภัยอยู่แล้วอันเดียว ไม่ต้องแก้

**Schema ที่จะเพิ่ม** (ยังไม่ implement):
```prisma
enum RolloverPolicy { RESET  ROLLOVER  SWEEP }

model Budget {
  // ...fields เดิม...
  rolloverPolicy RolloverPolicy @default(RESET)
  monthlyTarget  Decimal? @db.Decimal(15, 2)  // ใช้เฉพาะ policy RESET, null = fallback ใช้ allocatedAmount ปัจจุบันตอน close
  periodYear     Int   @default(dbgenerated("EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int"))   // เดือน/ปีที่ allocatedAmount/spentAmount ปัจจุบัน "แทน" อยู่
  periodMonth    Int   @default(dbgenerated("EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Bangkok'))::int"))
}

model BudgetMonthlyHistory {
  id, budgetId, userId, year, month
  allocatedAmount Decimal  // ceiling ตอนปิดเดือนนั้น
  spentAmount     Decimal  // ยอดใช้สุดท้ายตอนปิด
  rolloverPolicy  RolloverPolicy
  closedAt        DateTime @default(now())
  @@unique([budgetId, year, month])
  @@index([userId, year, month])   // query ประวัติตามช่วงเวลา
}
```
`periodYear`/`periodMonth` ใช้ `dbgenerated` ผูกกับ Asia/Bangkok ตรงๆ ใน DB (ไม่พึ่ง server process TZ ซึ่งเป็น UTC บน Render/Neon) — ข้อดีคือ call site เดิมทั้งหมดที่ `prisma.budget.create()` (`budget.repository.ts`, `seed.ts`, test helper, `pool.service.ts`) **ไม่ต้องแก้เลย** blast radius เท่ากับ 0 ตรง call site สร้าง budget.

**หลักการสำคัญ (ไม่เปลี่ยน)**: `Budget.allocatedAmount`/`spentAmount` ยังอ่านตรงๆ เหมือนเดิมทุกจุด (`addStats()`, `getSummary()`, `checkAlerts()`, zero-based invariant) — ตีความใหม่เป็น "ยอดของ `periodYear`/`periodMonth` ปัจจุบันเท่านั้น" ไม่ต้องแก้ reader เหล่านี้เลย (ตรวจครบ 14 ไฟล์ที่อ่าน `spentAmount` แล้ว ทุกจุดเทียบกับ `allocatedAmount` ของ budget เดียวกัน ณ ปัจจุบันอยู่แล้ว ไม่มีจุดไหนสะสมข้ามเดือนเอง) — reports ที่ query จาก `Transaction.date` อยู่แล้วก็ปลอดภัยเช่นกัน ไม่ต้องแก้.

**สูตร reset ต่อ policy (แก้แล้ว, พิสูจน์ invariant ถือ)**:
- **SWEEP**: `allocated=0, spent=0` → remaining=0 เสมอ ปลอดภัยไม่มีเงื่อนไข
- **ROLLOVER**: `newAllocated = max(oldAllocated - oldSpent, 0)` (ไม่ใช่ `+=` อีกต่อไป), `newSpent = 0` — proof: `newRemaining = newAllocated = max(oldAllocated-oldSpent,0) = oldRemaining` (ค่าเดิมเป๊ะ, floor เดียวกับที่ `getAllocationTotals()` ใช้อยู่แล้ว) → remaining ไม่ขยับ invariant ถืออัตโนมัติ เป็น local operation ไม่ต้องเช็คข้าม budget อื่น. Clamp ที่ 0 กัน legacy data ที่ spent>allocated ทำให้ allocated ติดลบ
- **RESET**: ต้องมี pool คำนวณข้าม budget เพราะไม่มีเงินใหม่เข้าระบบเอง — เงินไม่พอ **เติมบางส่วนเสมอ ไม่ error ไม่ข้าม** แล้วแจ้งเตือนผ่าน `NotificationType.BUDGET_ALERT` เดิม (ตัดสินใจแล้ว — ไม่เพิ่ม enum ใหม่เฟสนี้ ลดของที่ต้อง migrate, ข้อความแยกชัดพอในตัว):
  ```
  pool = balance - Σremaining (ทั้งระบบ, ใช้ getAllocationTotals() ตัวเดิม ไม่เขียน query ซ้ำ)
  target        = monthlyTarget ?? oldAllocated
  oldRemaining  = max(oldAllocated - oldSpent, 0)
  topup         = min(max(target - oldRemaining, 0), pool)
  newAllocated  = oldRemaining + topup
  newSpent      = 0
  ```
  Proof: `Σremaining` เพิ่มสูงสุด `topup ≤ pool` ทุก step → invariant ถือหลังทุก step (assert เป็น step-by-step ใน test ได้เลย ไม่ใช่แค่ปลายทาง)

**ลำดับประมวลผล — ต้องเป็น 2 pass ต่อ user ใน 1 transaction เดียว** (เปลี่ยนจาก design เดิมที่คิดว่าทำต่อ budget เดี่ยวได้ — RESET แย่ง pool ร่วมกันข้าม budget ทำแยกอิสระไม่ได้):
1. Pass 1: budget ที่ close ด้วย SWEEP/ROLLOVER ทั้งหมดก่อน (ไม่กิน pool เลย — SWEEP ปล่อย pool เพิ่ม, ROLLOVER คงที่)
2. Pass 2: budget RESET เรียงตาม `sortOrder` (deterministic, ลำดับเดียวกับ UI) recompute pool สดจาก `getAllocationTotals(tx)` ก่อนทุก budget (เห็นผล budget ก่อนหน้าใน pass เดียวกันเพราะอยู่ tx เดียวกัน) — first-come-first-served ตาม sortOrder ถ้า pool หมดกลางทาง budget หลังได้ topup=0

ต้อง `lockUser(tx, userId)` (advisory xact lock ตัวเดิมใน `budget.service.ts`) ครอบทั้ง 2 pass กัน cron กับ lazy hook แย่ง pool เดียวกันพร้อมกัน.

**เปลี่ยนชื่อ/scope ฟังก์ชันหลัก**: `closeAndAdvancePeriodsForUser(userId)` (ทำทุก budget ที่ due ของ user เดียวพร้อมกัน) **ไม่ใช่** `closeAndAdvancePeriod(budgetId)` ต่อ budget เดี่ยวเหมือน draft แรก — idempotency ต่อ budget ยังอยู่ (ตัวที่ period ตรงปัจจุบันแล้ว skip ในลูป) แต่หน่วยอะตอมมิกคือทุก budget ของ user 1 คนที่ due พร้อมกัน. Cron loop เรียกฟังก์ชันนี้ต่อ user (ไม่ loop ต่อ budget ซ้อนอีกชั้นแบบ draft แรก), lazy hook ที่ `budget.service.ts getAll()`/`dashboard.service.ts getSummary()` เรียกจุดเดียวกันก่อนอ่าน budget — ใช้ทั้งคู่ไม่ใช่เลือกอย่างใดอย่างหนึ่ง (คง reasoning เดิม: cron อย่างเดียวเสี่ยง Render free tier sleep พลาดไปทั้งวัน).

Archived budget: ข้ามอัตโนมัติฟรี ไม่ต้องเขียน logic เพิ่ม — ทั้ง cron loop และ lazy hook ดึง budget ผ่าน `repo.findAll(userId)` ตัวเดิมซึ่ง filter `isArchived: false` อยู่แล้ว (จุดเดียวกับ `checkAlerts`/`getAllocationTotals`).

**เกณฑ์ "เดือนปิดแล้ว"**: ผูกกับ `budget.periodYear/periodMonth` เท่านั้น **ไม่ใช้ wall-clock เทียบตรงๆ** — `(transaction.date's year,month) < (budget.periodYear, budget.periodMonth)` ถึงจะถือว่าปิด ใช้เกณฑ์เดียวกันไม่ว่า trigger จาก cron หรือ lazy eval.

**บล็อกทั้ง create/update/delete** ของ transaction ที่ date ตกอยู่ในเดือนปิดแล้ว (ทั้ง 2 ทิศทาง: แก้ของเก่าให้เข้าเดือนปิด และสร้างใหม่ย้อนหลังเข้าเดือนปิด) — ตัดสินใจแล้ว error message ต้องบอกทางออกด้วย:
```
รายการนี้อยู่ในเดือนที่ปิดแล้ว แก้ไขไม่ได้
หากต้องการปรับปรุง ให้บันทึกรายการใหม่ในเดือนปัจจุบันแทน
```

**Phasing**: Phase 3 = RESET+SWEEP+ROLLOVER logic ครบ (สูตรแก้แล้วทั้ง 3 ตัว จริงๆ ROLLOVER กลับง่ายกว่า RESET ตอนนี้ — RESET ต้องมี pool/2-pass/monthlyTarget field, ROLLOVER เป็น local operation ล้วน), UI เลือก `rolloverPolicy`: ตัวเลือก ROLLOVER **ไม่ disabled ไม่ซ่อน** เพราะ logic พร้อมใช้จริงตั้งแต่ Phase 3 แล้ว (ต่างจาก draft แรกที่วางแผนดอง ROLLOVER ไว้ Phase 4) — เฟสถัดไปที่เหลือจริงๆ คือ live-test บน production กับ edge case เพิ่มเติมถ้าเจอ ไม่ใช่ logic ที่ยังไม่มี.

**Migration SQL** ร่างแรก (schema+enum+history table+index) อนุมัติแล้ว ณ ตอนตรวจทาน แต่ **ยังไม่ apply ที่ไหนทั้งสิ้น** — ต้องรวม `monthlyTarget` column เข้าไปในไฟล์เดียวกันก่อน (SQL ร่างแรกยังไม่มี field นี้ เกิดทีหลังตอนแก้ RESET) แล้วค่อย apply.

**Deploy strategy ที่ตกลง**: รัน `prisma migrate deploy` + backfill script ตรงกับ Neon (production DB) จากเครื่อง local ก่อน แล้วค่อย push โค้ดขึ้น — กันช่วงเวลาที่โค้ดใหม่รันแล้วแต่ schema/data ยังไม่พร้อม (production แสดงยอดผิดชั่วคราว).

**Backfill script** (`backend/scripts/backfill-period-spend.ts`, แยกจาก migration SQL): recompute `spentAmount` ทุก budget ให้เหลือเฉพาะยอดใช้จริงของเดือนปฏิทินปัจจุบัน (Bangkok) — เหตุผล: `spentAmount` เดิมสะสมตลอดกาลจริง (ยืนยันจาก comment `reports.service.ts` เดิม) ถ้าไม่ recompute ตอน stamp `periodYear/periodMonth = เดือนปัจจุบัน` ยอด remaining จะเพี้ยนทันทีทั้งเดือนแรกหลัง deploy. ใช้ `getExpenseByBudget()` จาก `split-aware-spend.ts` ตัวเดิม (จัดการ borrow-split ถูกต้องอยู่แล้ว) **ไม่เขียน join logic ซ้ำเป็น raw SQL** กัน bug จาก duplicate logic.

**คำถามที่ตอบแล้ว** (เดิมค้างไว้ในร่างแรก):
1. cron ข้ามหลายเดือน → ปิดทีละเดือนไล่ลำดับ (ไม่กระโดด) เก็บ `BudgetMonthlyHistory` ครบทุกเดือน — จำเป็นสำหรับ ROLLOVER carry-forward correctness ด้วย (กระโดดข้ามจะไม่มีเดือนกลางให้อ้างอิง)
2. UI ROLLOVER dropdown → ไม่เกี่ยวแล้ว เพราะ ROLLOVER logic พร้อมใช้ตั้งแต่ Phase 3 (ดู Phasing ด้านบน)

**Test scope ที่ตกลง**: `assertZeroBasedInvariant(userId)` helper (query จริงแล้ว assert `Σremaining ≤ balance`) เรียกหลัง close ทุก policy ทุกเคส — RESET (fully-funded/partial-fill/pool=0/2 budget แย่ง pool เดียวกัน), ROLLOVER (ปกติ + legacy spent>allocated ยืนยัน clamp), reset budget ที่มี `TransactionSplit` ค้างจาก borrow, ข้ามหลายเดือน, concurrency (cron ชนกับ lazy hook ตอน pool จำกัด — ยืนยัน `lockUser` กันแย่งซ้ำจริง ไม่ใช่แค่ comment), closed-period guard ทั้ง 3 operation.

**ความเสี่ยงอื่นที่ระบุไว้แล้ว** (รายละเอียดเต็มอยู่ในบทสนทนา plan mode 2026-08-14, ไม่ทวนซ้ำที่นี่): deadlock risk จาก multi-budget lock (mitigate ด้วย `lockUser` advisory lock แบบเดียวกับที่ borrow feature ใช้แล้ว), test เดิมใน `budget.service.test.ts` ยัง valid เพราะ scalar ทำงานแบบเดิมภายใน 1 period.

**สถานะ (อัปเดต 2026-08-16)**: เขียนโค้ดครบตาม design นี้แล้ว — schema+migration (`20260816000000_add_monthly_reset_rollover`, apply แล้วที่ dev+test local, **ยัง apply Neon prod ไม่ได้**), `BudgetService.closeAndAdvancePeriodsForUser()` (2-pass, lockUser, month-major catch-up), `backend/scripts/backfill-period-spend.ts` (dry-run default + DB-name guard + epsilon-safe diff), closed-period guard บน transaction create/update/delete/batchCreate + `pool.service.ts reverseContribution()`, test ครบ (`assertZeroBasedInvariant` helper + ครอบ RESET/ROLLOVER/SWEEP/idempotency/multi-month/concurrency/closed-period), UI (`BudgetForm.tsx` radio group + monthlyTarget field, badge บน `BudgetCard.tsx`, ROLLOVER disabled ทั้ง frontend+backend) — ผ่าน code review ละเอียดก่อน deploy แล้ว (เจอ+แก้ 1 บั๊กจริงใน backfill script, ดู known gaps ด้านบนอีก 2 ข้อที่ตัดสินใจไม่แก้ตอนนี้) เหลือ: apply migration+backfill กับ Neon ตาม deploy strategy ด้านบน แล้วค่อย push โค้ด.

### Environment ที่ต้องเตรียมก่อนเริ่ม Phase 3

- `docker start budgetflow-db` — container เดียวมีทั้ง `budgetflow` (dev) และ `budgetflow_test` (test suite) DB อยู่แล้ว ไม่ต้องสร้างใหม่
- Neon branch `backup-before-phase3` — เตรียมไว้สำหรับ rollback ก่อนแตะ production schema รอบใหญ่ (migration ADD COLUMN บน `Budget` ที่มีข้อมูลจริงอยู่แล้ว)
