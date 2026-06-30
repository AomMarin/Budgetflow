import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Wallet, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/services/api';
import { Account } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/utils/format';
import { Modal } from '@/components/ui/Modal';

export function InitialSetupSection() {
  const qc = useQueryClient();

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
  });

  const defaultAccount = accounts.find((a) => a.isDefault) ?? accounts[0];
  const currentBalance = Number(defaultAccount?.balance ?? 0);

  const [balanceInput, setBalanceInput] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const setupBalance = useMutation({
    mutationFn: (balance: number) =>
      api.post('/accounts/setup-balance', { balance }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      setBalanceInput('');
      toast.success('ตั้งยอดเงินเริ่มต้นแล้ว');
    },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  });

  const resetData = useMutation({
    mutationFn: () => api.post('/accounts/reset-data'),
    onSuccess: () => {
      qc.invalidateQueries();
      setShowResetConfirm(false);
      setResetDone(true);
      setTimeout(() => setResetDone(false), 4000);
      toast.success('รีเซตข้อมูลทั้งหมดแล้ว', { duration: 4000 });
    },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  });

  const handleSetBalance = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(balanceInput);
    if (isNaN(val) || val < 0) return;
    setupBalance.mutate(val);
  };

  return (
    <>
      <div className="card p-6 space-y-6">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary-500" />
            ตั้งค่าข้อมูลเริ่มต้น
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            กำหนดยอดเงินเริ่มต้น หรือล้างข้อมูลเพื่อเริ่มใหม่
          </p>
        </div>

        {/* Current balance display */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl">
          <div>
            <p className="text-xs text-gray-500">ยอดเงินปัจจุบัน ({defaultAccount?.name ?? 'Main Account'})</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
              {formatCurrency(currentBalance)}
            </p>
          </div>
          {resetDone && (
            <div className="flex items-center gap-1.5 text-green-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              รีเซตแล้ว
            </div>
          )}
        </div>

        {/* Set starting balance */}
        <form onSubmit={handleSetBalance} className="space-y-3">
          <div>
            <label className="label">ตั้งยอดเงินเริ่มต้น (บาท)</label>
            <p className="text-xs text-gray-400 mb-2">
              ระบุจำนวนเงินที่มีอยู่จริงในบัญชี เช่น ยอดคงเหลือจาก Bank Statement
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                placeholder="เช่น 50000"
                className="flex-1"
              />
              <Button
                type="submit"
                loading={setupBalance.isPending}
                disabled={!balanceInput || parseFloat(balanceInput) < 0}
              >
                ตั้งค่า
              </Button>
            </div>
          </div>
        </form>

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Reset section */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              รีเซตข้อมูลทั้งหมด
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              ล้างรายการธุรกรรม การจัดสรร และยอดเงินทั้งหมด
              แต่คงไว้ซึ่ง Budget buckets และรายการอัตโนมัติ
            </p>
          </div>
          <Button
            variant="danger"
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={() => setShowResetConfirm(true)}
          >
            รีเซตข้อมูลทั้งหมด
          </Button>
        </div>
      </div>

      {/* Reset confirm modal */}
      <Modal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="รีเซตข้อมูลทั้งหมด"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700 dark:text-red-400 space-y-1">
              <p className="font-semibold">ข้อมูลต่อไปนี้จะถูกลบถาวร:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>รายการธุรกรรมทั้งหมด (INCOME / EXPENSE)</li>
                <li>การจัดสรรรายได้ทั้งหมด</li>
                <li>การโอนระหว่าง Budget ทั้งหมด</li>
                <li>ไฟล์ import ทั้งหมด</li>
                <li>ยอดเงินในบัญชีจะกลับเป็น ฿0</li>
                <li>ยอดจัดสรร/ใช้ไปของ Budget ทุกอันจะกลับเป็น ฿0</li>
              </ul>
              <p className="font-semibold mt-2">สิ่งที่ยังคงอยู่:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Budget buckets (โครงสร้าง ชื่อ สี ไอคอน)</li>
                <li>รายการอัตโนมัติ (Recurring)</li>
                <li>กฎ auto-categorize (Import rules)</li>
              </ul>
            </div>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            ไม่สามารถกู้คืนข้อมูลได้ ยืนยันหรือไม่?
          </p>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowResetConfirm(false)}
              disabled={resetData.isPending}
            >
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={resetData.isPending}
              onClick={() => resetData.mutate()}
            >
              ยืนยัน รีเซต
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
