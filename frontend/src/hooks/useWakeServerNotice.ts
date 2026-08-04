import { useEffect } from 'react';
import toast from 'react-hot-toast';

const WAKE_TOAST_ID = 'wake-server';

export function useWakeServerNotice(isPending: boolean) {
  useEffect(() => {
    if (!isPending) {
      toast.dismiss(WAKE_TOAST_ID);
      return;
    }
    const timer = setTimeout(() => {
      toast.loading('กำลังปลุกเซิร์ฟเวอร์ อาจใช้เวลาสักครู่ เนื่องจากเป็นการเรียกใช้งานครั้งแรก', {
        id: WAKE_TOAST_ID,
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [isPending]);
}
