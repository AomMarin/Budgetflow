import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, Clock, Plus, Trash2, Download, Info } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/services/api';
import { useBudgets } from '@/hooks/useBudgets';
import { ImportFile, ImportRule } from '@/types';
import { formatDate, formatDateTime } from '@/utils/format';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useQuery as useAccountsQuery } from '@tanstack/react-query';
import { Account } from '@/types';

function downloadTemplate(lang: 'th' | 'en') {
  const now = new Date();
  const d = (offset: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - offset);
    return dt.toISOString().slice(0, 10);
  };

  const header = lang === 'th' ? 'วันที่,รายการ,จำนวนเงิน' : 'Date,Description,Amount';
  const rows = [
    `${d(0)},เงินเดือน มิถุนายน,30000`,
    `${d(2)},ค่าเช่าบ้าน,-8000`,
    `${d(3)},ค่าอาหาร KFC,-280`,
    `${d(5)},ค่าน้ำมัน PTT,-1500`,
    `${d(7)},Grab Food,-350`,
    `${d(10)},ค่าไฟฟ้า,-1200`,
    `${d(12)},Netflix,-299`,
    `${d(15)},Freelance Project,5000`,
    `${d(20)},ซื้อของ Lotus,-890`,
    `${d(25)},ค่าอินเทอร์เน็ต,-799`,
  ];

  const csv = '﻿' + [header, ...rows].join('\r\n'); // BOM for Excel Thai charset
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budgetflow-template-${lang}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ImportsPage() {
  const [showRuleForm, setShowRuleForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState('');
  const qc = useQueryClient();

  const { data: accounts = [] } = useAccountsQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data.data.accounts,
  });

  const { data: importsData } = useQuery<{ imports: ImportFile[] }>({
    queryKey: ['imports'],
    queryFn: async () => (await api.get('/imports')).data.data,
    refetchInterval: 5000,
  });

  const { data: rulesData } = useQuery<{ rules: ImportRule[] }>({
    queryKey: ['import-rules'],
    queryFn: async () => (await api.get('/imports/rules')).data.data,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);
      return api.post('/imports/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('File uploaded. Processing...');
      qc.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Upload failed');
    },
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.delete(`/imports/rules/${id}`),
    onSuccess: () => {
      toast.success('Rule deleted');
      qc.invalidateQueries({ queryKey: ['import-rules'] });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!accountId) { toast.error('Select an account first'); return; }
      uploadMutation.mutate(file);
    }
  };

  const imports = importsData?.imports ?? [];
  const rules = rulesData?.rules ?? [];

  const statusConfig = {
    PENDING: { icon: Clock, color: 'text-amber-500', label: 'Pending', badge: 'warning' as const },
    PROCESSING: { icon: Clock, color: 'text-blue-500', label: 'Processing', badge: 'info' as const },
    COMPLETED: { icon: CheckCircle, color: 'text-green-500', label: 'Completed', badge: 'success' as const },
    FAILED: { icon: XCircle, color: 'text-red-500', label: 'Failed', badge: 'danger' as const },
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Upload area */}
      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Upload Bank Statement</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload a CSV file with columns: Date, Description, Amount.
          Transactions will be auto-categorized using your rules.
        </p>

        {/* Format guide + template download */}
        <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 p-4 mb-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">รูปแบบไฟล์ CSV ที่รองรับ</p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="text-left">
                      {['คอลัมน์', 'ชื่อที่ใช้ได้', 'ตัวอย่าง', 'หมายเหตุ'].map((h) => (
                        <th key={h} className="pb-1 pr-4 font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 dark:text-gray-400">
                    <tr>
                      <td className="pr-4 py-0.5 font-medium">วันที่</td>
                      <td className="pr-4 font-mono">Date, วันที่, transaction date</td>
                      <td className="pr-4 font-mono">2026-06-30</td>
                      <td>รูปแบบ YYYY-MM-DD หรือ DD/MM/YYYY</td>
                    </tr>
                    <tr>
                      <td className="pr-4 py-0.5 font-medium">รายการ</td>
                      <td className="pr-4 font-mono">Description, รายการ, memo</td>
                      <td className="pr-4 font-mono">ค่าอาหาร KFC</td>
                      <td>ข้อความอธิบายรายการ</td>
                    </tr>
                    <tr>
                      <td className="pr-4 py-0.5 font-medium">จำนวนเงิน</td>
                      <td className="pr-4 font-mono">Amount, จำนวนเงิน, debit</td>
                      <td className="pr-4 font-mono text-red-500">-280</td>
                      <td>
                        <span className="text-green-600 dark:text-green-400 font-medium">ค่าบวก</span> = รายรับ,{' '}
                        <span className="text-red-500 font-medium">ค่าลบ</span> = รายจ่าย
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-blue-100 dark:border-blue-900/40">
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">ดาวน์โหลดไฟล์ตัวอย่าง:</span>
            <button
              type="button"
              onClick={() => downloadTemplate('th')}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-white dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-800/40 transition-colors"
            >
              <Download className="w-3 h-3" /> ภาษาไทย (.csv)
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate('en')}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-white dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-800/40 transition-colors"
            >
              <Download className="w-3 h-3" /> English (.csv)
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="input w-60"
          >
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors"
        >
          <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="font-medium text-gray-700 dark:text-gray-300">Drop CSV file or click to browse</p>
          <p className="text-sm text-gray-400 mt-1">Supported: .csv, .txt (max 5MB)</p>
          {uploadMutation.isPending && (
            <p className="text-sm text-primary-600 mt-2 font-medium">Uploading...</p>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Import history */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Import History</h2>
        </div>
        {imports.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No imports yet</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {imports.map((imp) => {
              const cfg = statusConfig[imp.status];
              const StatusIcon = cfg.icon;
              return (
                <div key={imp.id} className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{imp.originalName}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(imp.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {imp.status === 'COMPLETED' && (
                      <div className="text-xs text-gray-500 text-right">
                        <p>{imp.rowCount} rows imported</p>
                        <p>{imp.matchedCount} auto-categorized</p>
                      </div>
                    )}
                    {imp.errorMessage && (
                      <p className="text-xs text-red-500 max-w-xs truncate">{imp.errorMessage}</p>
                    )}
                    <Badge variant={cfg.badge}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {cfg.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Rules */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">Auto-categorization Rules</h2>
          <Button size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowRuleForm(true)}>
            Add Rule
          </Button>
        </div>
        <p className="text-xs text-gray-400 px-6 py-2">
          Transactions containing the keyword are automatically assigned to the budget.
        </p>
        {rules.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">No rules. Add one to auto-categorize imports.</div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                    {rule.keyword}
                  </span>
                  <span className="text-gray-400 text-xs">→</span>
                  <span className="text-sm flex items-center gap-1.5">
                    <span>{rule.budget.icon}</span>
                    <span className="text-gray-700 dark:text-gray-300">{rule.budget.name}</span>
                  </span>
                </div>
                <button
                  onClick={() => deleteRule.mutate(rule.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <RuleForm open={showRuleForm} onClose={() => setShowRuleForm(false)} />
    </div>
  );
}

function RuleForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: budgets = [] } = useBudgets();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [priority, setPriority] = useState('0');

  const create = useMutation({
    mutationFn: (data: object) => api.post('/imports/rules', data),
    onSuccess: () => {
      toast.success('Rule created');
      qc.invalidateQueries({ queryKey: ['import-rules'] });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Failed to create rule');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ keyword, budgetId, priority: parseInt(priority) });
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Auto-categorization Rule">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Keyword"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. KFC, Grab, Netflix"
          required
          hint="Case-insensitive. Matches if the transaction description contains this keyword."
        />
        <div>
          <label className="label">Assign to Budget</label>
          <select value={budgetId} onChange={(e) => setBudgetId(e.target.value)} className="input" required>
            <option value="">Select budget</option>
            {budgets.map((b) => <option key={b.id} value={b.id}>{b.icon} {b.name}</option>)}
          </select>
        </div>
        <Input
          label="Priority (higher = checked first)"
          type="number"
          min="0"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" loading={create.isPending}>Create Rule</Button>
        </div>
      </form>
    </Modal>
  );
}
