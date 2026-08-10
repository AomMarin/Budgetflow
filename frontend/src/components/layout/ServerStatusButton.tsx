import { Server, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ServerStatus } from '@/hooks/useKeepAlive';
import { cn } from '@/utils/cn';

interface Props {
  status: ServerStatus;
  onRefresh: () => Promise<boolean>;
}

const labels: Record<ServerStatus, string> = {
  checking: 'กำลังตรวจสอบเซิร์ฟเวอร์...',
  ready: 'เซิร์ฟเวอร์พร้อมใช้งาน',
  waking: 'เซิร์ฟเวอร์กำลังตื่น — คลิกเพื่อปลุกอีกครั้ง',
};

// Quiet by default (blends in like the theme switcher) — only turns amber
// and gets a pulsing dot when the backend actually looks asleep, so it
// doesn't compete for attention on every normal page view.
export function ServerStatusButton({ status, onRefresh }: Props) {
  async function handleClick() {
    if (status === 'checking') return;
    const ok = await onRefresh();
    if (ok) toast.success('เซิร์ฟเวอร์พร้อมใช้งานแล้ว');
    else toast.error('ปลุกเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง');
  }

  const isChecking = status === 'checking';
  const isWaking = status === 'waking';

  return (
    <button
      onClick={handleClick}
      disabled={isChecking}
      title={labels[status]}
      aria-label={labels[status]}
      className={cn(
        'relative p-2 rounded-lg transition-colors disabled:cursor-wait',
        isWaking
          ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
          : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
      )}
    >
      {isChecking ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Server className="w-5 h-5" />
      )}
      {isWaking && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
      )}
    </button>
  );
}
