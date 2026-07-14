import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useCreateAdminUser, useUpdateAdminUser } from '@/hooks/useAdmin';
import { Role, User } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  user?: User;
}

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*[0-9])/;

export function UserForm({ open, onClose, user }: Props) {
  const isEditing = !!user;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('USER');
  const [passwordTouched, setPasswordTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(user?.email ?? '');
      setPassword('');
      setName(user?.name ?? '');
      setRole(user?.role ?? 'USER');
      setPasswordTouched(false);
    }
  }, [open, user]);

  const create = useCreateAdminUser();
  const update = useUpdateAdminUser();
  const isLoading = create.isPending || update.isPending;

  // Editing: password is optional — blank means "leave unchanged"
  const passwordValid = isEditing
    ? password.length === 0 || (password.length >= 8 && PASSWORD_RULE.test(password))
    : password.length >= 8 && PASSWORD_RULE.test(password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      update.mutate(
        { id: user.id, name, email, role, ...(password ? { password } : {}) },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ email, password, name, role }, { onSuccess: onClose });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="ชื่อ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อผู้ใช้"
          required
          autoFocus
        />
        <Input
          label="อีเมล"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
        />
        <Input
          label="รหัสผ่าน"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          placeholder={isEditing ? 'เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยน' : 'อย่างน้อย 8 ตัวอักษร มีตัวพิมพ์ใหญ่และตัวเลข'}
          hint={passwordTouched && !passwordValid ? undefined : 'ต้องมีตัวพิมพ์ใหญ่และตัวเลขอย่างน้อย 1 ตัว'}
          error={passwordTouched && !passwordValid ? 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร มีตัวพิมพ์ใหญ่และตัวเลขอย่างน้อย 1 ตัว' : undefined}
          required={!isEditing}
          minLength={8}
        />
        <Select
          label="สิทธิ์การใช้งาน"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={[
            { value: 'USER', label: 'ผู้ใช้ทั่วไป (User)' },
            { value: 'ADMIN', label: 'ผู้ดูแลระบบ (Admin)' },
          ]}
        />

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
            ยกเลิก
          </Button>
          <Button
            type="submit"
            className="flex-1"
            loading={isLoading}
            disabled={!name.trim() || !email.trim() || !passwordValid}
          >
            {isEditing ? 'บันทึกการแก้ไข' : 'สร้างผู้ใช้'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
