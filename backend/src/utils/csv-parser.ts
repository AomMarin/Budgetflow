import { parse } from 'csv-parse';
import fs from 'fs';

export interface CsvRow {
  date: string;
  description: string;
  amount: string;
  type?: string;
}

export interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
}

// Normalize common CSV column name variations
const DATE_ALIASES = ['date', 'วันที่', 'transaction date', 'txn date'];
const DESC_ALIASES = ['description', 'desc', 'รายการ', 'detail', 'details', 'memo', 'narration'];
const AMOUNT_ALIASES = ['amount', 'จำนวนเงิน', 'debit', 'credit', 'value'];

function normalizeHeaders(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    if (DATE_ALIASES.includes(lower)) map['date'] = header;
    else if (DESC_ALIASES.includes(lower)) map['description'] = header;
    else if (AMOUNT_ALIASES.includes(lower)) map['amount'] = header;
  }
  return map;
}

export async function parseCsvFile(filePath: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    const results: ParsedTransaction[] = [];
    let headerMap: Record<string, string> = {};

    const parser = parse({ columns: true, skip_empty_lines: true, trim: true });

    parser.on('readable', () => {
      let record: Record<string, string>;
      while ((record = parser.read()) !== null) {
        if (Object.keys(headerMap).length === 0) {
          headerMap = normalizeHeaders(Object.keys(record));
        }

        const dateStr = record[headerMap['date']]?.trim();
        const desc = record[headerMap['description']]?.trim();
        const amountStr = record[headerMap['amount']]?.trim()?.replace(/,/g, '');

        if (!dateStr || !desc || !amountStr) continue;

        const amount = parseFloat(amountStr);
        if (isNaN(amount)) continue;

        const date = new Date(dateStr);
        if (isNaN(date.getTime())) continue;

        results.push({
          date,
          description: desc,
          amount: Math.abs(amount),
          type: amount < 0 ? 'EXPENSE' : 'INCOME',
        });
      }
    });

    parser.on('error', reject);
    parser.on('end', () => resolve(results));

    fs.createReadStream(filePath).pipe(parser);
  });
}

export function applyCategorizationRules(
  transactions: ParsedTransaction[],
  rules: { keyword: string; budgetId: string; priority: number }[],
): (ParsedTransaction & { budgetId: string | null })[] {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  return transactions.map((tx) => {
    const descLower = tx.description.toLowerCase();
    const matchedRule = sortedRules.find((rule) =>
      descLower.includes(rule.keyword.toLowerCase()),
    );
    return { ...tx, budgetId: matchedRule?.budgetId ?? null };
  });
}
