# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BudgetFlow — zero-based budgeting app ("every baht has a purpose"). Full-stack TypeScript monorepo with separate `backend/` and `frontend/` workspaces.

**Demo account:** demo@budgetflow.app / Password123!

---

## Commands

### Backend (`cd backend`)

```bash
npm run dev          # Start dev server with hot-reload (tsx watch) on port 3001
npm run build        # Compile TypeScript to dist/
npm run lint         # ESLint src/**/*.ts
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier

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
```

### Required `.env` (backend)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/budgetflow
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
```

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

### สิ่งที่ยังไม่ได้ทำ / ปรับปรุงได้

- Reports page charts ไม่แสดงใน headless browser (บนมือถือจริงแสดงปกติ)
- BottomNav ไม่มีปุ่ม Reports และ Import (ใส่ได้แค่ 5 ปุ่ม เลือกเฉพาะหน้าหลัก)
- Transaction บนมือถือ ปุ่ม Delete ซ่อนไว้ (มีแค่ Edit) — กด Edit แล้วค่อยลบได้จาก form
