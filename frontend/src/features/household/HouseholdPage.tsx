import { useState } from 'react';
import { Users, UserPlus, Copy, LogOut, Trash2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatCurrency } from '@/utils/format';
import { useAuthStore } from '@/stores/auth.store';
import {
  useHousehold,
  useHouseholdOverview,
  useCreateHousehold,
  useCreateInvite,
  useJoinHousehold,
  useRemoveMember,
  useLeaveHousehold,
  useDeleteHousehold,
} from '@/hooks/useHousehold';

export function HouseholdPage() {
  const { user } = useAuthStore();
  const { data: household, isLoading } = useHousehold();
  const { data: overview } = useHouseholdOverview();

  const createHousehold = useCreateHousehold();
  const joinHousehold = useJoinHousehold();
  const createInvite = useCreateInvite();
  const removeMember = useRemoveMember();
  const leaveHousehold = useLeaveHousehold();
  const deleteHousehold = useDeleteHousehold();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);

  const isOwner = household?.myRole === 'OWNER';

  const handleGenerateInvite = () => {
    if (!household) return;
    createInvite.mutate(household.id, {
      onSuccess: (data) => {
        setInvite(data);
        setCopied(false);
      },
    });
  };

  const copyCode = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-6 animate-fade-in">
        <div className="card p-6 h-32 animate-pulse bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-500" />
            ครอบครัว / ใช้ร่วมกัน
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            ดูข้อมูลการเงินของสมาชิกในครอบครัวได้ (ดูได้อย่างเดียว แก้ไขได้เฉพาะของตัวเอง)
          </p>
        </div>

        {!household ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">สร้างครอบครัวใหม่</p>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ครอบครัวสมิท"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!name.trim()}
                loading={createHousehold.isPending}
                onClick={() => createHousehold.mutate(name.trim(), { onSuccess: () => setName('') })}
              >
                สร้าง
              </Button>
            </div>
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">เข้าร่วมด้วยรหัสเชิญ</p>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="วางรหัสเชิญที่ได้รับ"
              />
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={!code.trim()}
                loading={joinHousehold.isPending}
                onClick={() => joinHousehold.mutate(code.trim(), { onSuccess: () => setCode('') })}
              >
                เข้าร่วม
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{household.name}</p>
                <p className="text-xs text-gray-500">{household.members.length} สมาชิก</p>
              </div>
              {isOwner ? (
                <Button
                  size="sm"
                  icon={<UserPlus className="w-4 h-4" />}
                  loading={createInvite.isPending}
                  onClick={handleGenerateInvite}
                >
                  เชิญสมาชิก
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<LogOut className="w-4 h-4" />} onClick={() => leaveHousehold.mutate()}>
                  ออกจากครอบครัว
                </Button>
              )}
            </div>

            {invite && (
              <div className="p-3 rounded-xl bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">ส่งรหัสนี้ให้สมาชิกที่ต้องการเชิญ (หมดอายุ 7 วัน)</p>
                  <p className="font-mono text-sm font-semibold text-primary-700 dark:text-primary-400 truncate">{invite.code}</p>
                </div>
                <button
                  onClick={copyCode}
                  className="shrink-0 p-2 rounded-lg text-primary-600 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            )}

            {/* Member list */}
            <div className="space-y-2">
              {household.members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 flex items-center justify-center text-sm font-semibold shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.name}</p>
                      <p className="text-xs text-gray-500 truncate">{m.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={m.role === 'OWNER' ? 'info' : 'default'}>{m.role === 'OWNER' ? 'เจ้าของ' : 'สมาชิก'}</Badge>
                    {isOwner && m.role !== 'OWNER' && (
                      <button
                        onClick={() => setConfirmRemove({ userId: m.userId, name: m.name })}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Overview: read-only summary per member */}
            {overview && overview.members.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">ภาพรวมการเงิน</p>
                {overview.members.map((m) => (
                  <div key={m.userId} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {m.name} {m.userId === user?.id && <span className="text-xs text-gray-400">(คุณ)</span>}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {formatCurrency(m.summary.totalBalance, user?.currency)}
                      </span>
                    </div>
                    {m.summary.budgets.filter((b) => b.usagePercent >= 80).length > 0 ? (
                      <div className="space-y-1.5">
                        {m.summary.budgets
                          .filter((b) => b.usagePercent >= 80)
                          .slice(0, 3)
                          .map((b) => (
                            <div key={b.id}>
                              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                                <span>{b.icon} {b.name}</span>
                                <span>{b.usagePercent}%</span>
                              </div>
                              <ProgressBar value={b.usagePercent} size="sm" />
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">ทุกงบยังอยู่ในเกณฑ์ปกติ</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isOwner && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <Button size="sm" variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmDelete(true)}>
                  ลบครอบครัว
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm delete household */}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="ลบครอบครัว" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            สมาชิกทั้งหมดจะถูกนำออกจากครอบครัวนี้ ข้อมูลของแต่ละคนจะยังคงอยู่ (ไม่มีอะไรถูกลบ)
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>ยกเลิก</Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={deleteHousehold.isPending}
              onClick={() => deleteHousehold.mutate(undefined, { onSuccess: () => setConfirmDelete(false) })}
            >
              ลบ
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm remove member */}
      <Modal open={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="นำสมาชิกออก" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ต้องการนำ <span className="font-semibold text-gray-900 dark:text-white">{confirmRemove?.name}</span> ออกจากครอบครัวใช่ไหม?
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmRemove(null)}>ยกเลิก</Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={removeMember.isPending}
              onClick={() => {
                if (household && confirmRemove) {
                  removeMember.mutate(
                    { householdId: household.id, userId: confirmRemove.userId },
                    { onSuccess: () => setConfirmRemove(null) },
                  );
                }
              }}
            >
              นำออก
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
