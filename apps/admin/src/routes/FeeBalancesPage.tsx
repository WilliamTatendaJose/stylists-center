import { useState } from 'react';
import { AlertTriangle, DollarSign, Lock, Users } from 'lucide-react';
import { formatInHarare, formatUsd } from '@sc/shared';
import type { AdminFeeRowDto, FeeEntryDto, FeeStatementDto } from '@sc/shared';
import {
  useAdjustFees,
  useFeeBalances,
  useFeeDetail,
  useFeeSummary,
  useRecordFeePayment,
  type FeeFilter,
} from '../api/fees';
import { apiFetch, ApiError } from '../api/client';
import { Pager, SearchBox } from '../components/Pager';
import { Badge } from '../components/Badge';
import { Button } from '../components/ui/Button';
import { SelectField, TextField } from '../components/ui/Field';
import { StatTile } from '../components/ui/StatTile';

const FILTERS: { label: string; value: FeeFilter | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Owing', value: 'owing' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Restricted', value: 'restricted' },
];

const KIND_LABELS: Record<FeeEntryDto['kind'], string> = {
  booking_fee: 'Booking fee',
  order_fee: 'Order commission',
  waiver: 'Waived',
  payment: 'Payment',
  adjustment: 'Adjustment',
};

const muted = 'text-neutral-600 dark:text-dark-muted';
const errorText = 'text-sm text-accent-700 dark:text-dark-accent';

/** Parses "12.50" into cents, or null when it is not a positive amount. */
function toCents(input: string, allowNegative = false): number | null {
  const dollars = Number(input);
  if (!Number.isFinite(dollars) || dollars === 0) return null;
  if (dollars < 0 && !allowNegative) return null;
  return Math.round(dollars * 100);
}

function RecordPaymentForm({ row, onDone }: { row: AdminFeeRowDto; onDone: () => void }) {
  const record = useRecordFeePayment(row.providerId);
  const [amount, setAmount] = useState(
    row.balanceUsdCents > 0 ? String(row.balanceUsdCents / 100) : '',
  );
  const [method, setMethod] = useState<'cash' | 'bank' | 'other'>('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const cents = toCents(amount);
    if (cents === null) {
      setError('Enter an amount greater than 0.');
      return;
    }
    if (!note.trim()) {
      setError('Add a note, for example a receipt number.');
      return;
    }
    setError(null);
    record.mutate(
      { amountUsdCents: cents, method, note: note.trim() },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not record the payment.');
        },
      },
    );
  };

  return (
    <div className="rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-dark-text">
        Record a payment made outside the app
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_160px_1fr]">
        <TextField
          label="Amount (USD)"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
        <SelectField
          label="Paid by"
          value={method}
          onChange={(e) => {
            setMethod(e.target.value as typeof method);
          }}
        >
          <option value="cash">Cash</option>
          <option value="bank">Bank transfer</option>
          <option value="other">Other</option>
        </SelectField>
        <TextField
          label="Note"
          placeholder="Receipt number, who took it"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </div>
      {error ? <p className={`mb-3 ${errorText}`}>{error}</p> : null}
      <Button onClick={submit} disabled={record.isPending}>
        {record.isPending ? 'Recording…' : 'Record payment'}
      </Button>
    </div>
  );
}

function AdjustmentForm({ row, onDone }: { row: AdminFeeRowDto; onDone: () => void }) {
  const adjust = useAdjustFees(row.providerId);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const cents = toCents(amount, true);
    if (cents === null) {
      setError('Enter an amount, positive or negative.');
      return;
    }
    if (!note.trim()) {
      setError('Add a note explaining the correction.');
      return;
    }
    setError(null);
    adjust.mutate(
      { amountUsdCents: cents, note: note.trim() },
      {
        onSuccess: onDone,
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not record the adjustment.');
        },
      },
    );
  };

  return (
    <div className="rounded-xl bg-neutral-50 p-4 dark:bg-white/5">
      <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-dark-text">
        Adjust the balance
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
        <TextField
          label="Amount (USD)"
          placeholder="-5.00 to reduce"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
        />
        <TextField
          label="Note"
          placeholder="Why the balance is being corrected"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </div>
      <p className={`mb-3 text-xs ${muted}`}>
        A positive amount adds to what is owed, a negative amount reduces it.
      </p>
      {error ? <p className={`mb-3 ${errorText}`}>{error}</p> : null}
      <Button variant="secondary" onClick={submit} disabled={adjust.isPending}>
        {adjust.isPending ? 'Saving…' : 'Save adjustment'}
      </Button>
    </div>
  );
}

function StatementTable({ statements }: { statements: FeeStatementDto[] }) {
  if (statements.length === 0) return <p className={`text-sm ${muted}`}>No statements yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className={muted}>
          <tr>
            {[
              'Month',
              'Opening',
              'Fees',
              'Waived',
              'Paid',
              'Adjusted',
              'Closing',
              'Due',
              'Unpaid',
            ].map((h) => (
              <th key={h} className="px-2 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-neutral-900 dark:text-dark-text">
          {statements.map((s) => (
            <tr key={s.id} className="border-t border-neutral-200 dark:border-dark-border">
              <td className="px-2 py-1">{s.month}</td>
              <td className="px-2 py-1">{formatUsd(s.openingUsdCents)}</td>
              <td className="px-2 py-1">
                {formatUsd(s.bookingFeesUsdCents + s.orderFeesUsdCents)}
              </td>
              <td className="px-2 py-1">{formatUsd(s.waiversUsdCents)}</td>
              <td className="px-2 py-1">{formatUsd(s.paymentsUsdCents)}</td>
              <td className="px-2 py-1">{formatUsd(s.adjustmentsUsdCents)}</td>
              <td className="px-2 py-1 font-medium">{formatUsd(s.closingUsdCents)}</td>
              <td className="px-2 py-1">{formatInHarare(s.dueAt, 'd MMM yyyy')}</td>
              <td className="px-2 py-1">
                {s.unpaidUsdCents > 0 ? formatUsd(s.unpaidUsdCents) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EntryTable({ entries }: { entries: FeeEntryDto[] }) {
  if (entries.length === 0) return <p className={`text-sm ${muted}`}>No entries yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className={muted}>
          <tr>
            {['Date', 'Type', 'Job', 'Price', 'Rate', 'Amount', 'Note'].map((h) => (
              <th key={h} className="px-2 py-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-neutral-900 dark:text-dark-text">
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-neutral-200 dark:border-dark-border">
              <td className="px-2 py-1">{formatInHarare(e.createdAt, 'd MMM yyyy HH:mm')}</td>
              <td className="px-2 py-1">{KIND_LABELS[e.kind]}</td>
              <td className="px-2 py-1">
                {e.reference ? `${e.reference} · ${e.label ?? ''}` : '—'}
              </td>
              <td className="px-2 py-1">
                {e.baseUsdCents === null ? '—' : formatUsd(e.baseUsdCents)}
              </td>
              <td className="px-2 py-1">
                {e.rateBps === null ? '—' : `${String(e.rateBps / 100)}%`}
              </td>
              <td className="px-2 py-1">{formatUsd(e.amountUsdCents)}</td>
              <td className="px-2 py-1">{e.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProviderDetail({ row, onDone }: { row: AdminFeeRowDto; onDone: () => void }) {
  const { data, isLoading, isError } = useFeeDetail(row.providerId);
  return (
    <div className="mt-4 space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecordPaymentForm row={row} onDone={onDone} />
        <AdjustmentForm row={row} onDone={onDone} />
      </div>
      {isLoading ? <p className={`text-sm ${muted}`}>Loading…</p> : null}
      {isError ? <p className={errorText}>Couldn&apos;t load this provider&apos;s fees.</p> : null}
      {data ? (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-dark-text">
              Statements
            </h3>
            <StatementTable statements={data.statements} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-dark-text">
              Ledger entries (latest {data.entries.length})
            </h3>
            <EntryTable entries={data.entries} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function FeeRow({ row }: { row: AdminFeeRowDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-dark-text">
            {row.displayName} · {row.phone}
          </p>
          <p className={`mt-0.5 text-sm ${muted}`}>
            {row.lastPaymentAt && row.lastPaymentUsdCents !== null
              ? `Last payment ${formatUsd(row.lastPaymentUsdCents)} on ${formatInHarare(row.lastPaymentAt, 'd MMM yyyy')}`
              : 'No payments yet'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {row.restricted ? <Badge label="Restricted" tone="dark" /> : null}
          {row.overdueUsdCents > 0 ? (
            <Badge label={`${formatUsd(row.overdueUsdCents)} overdue`} tone="accent" />
          ) : null}
          <Badge
            label={row.balanceUsdCents > 0 ? `Owes ${formatUsd(row.balanceUsdCents)}` : 'Settled'}
            tone={row.balanceUsdCents > 0 ? 'accent' : 'neutral'}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setOpen((v) => !v);
            }}
          >
            {open ? 'Close' : 'Open'}
          </Button>
        </div>
      </div>
      {open ? (
        <ProviderDetail
          row={row}
          onDone={() => {
            /* Forms keep the detail open: the new entry shows straight away. */
          }}
        />
      ) : null}
    </div>
  );
}

export function FeeBalancesPage() {
  const [filter, setFilter] = useState<FeeFilter | undefined>(undefined);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { data: summary } = useFeeSummary();
  const { data, isLoading, isError } = useFeeBalances({ filter, q, offset });

  const exportCsv = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const file = await apiFetch<Blob>('/v1/admin/fees/export.csv', { blob: true });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fee-balances.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-lg font-bold text-neutral-900 dark:text-dark-text">Fee balances</h1>
      <p className={`mb-6 text-sm ${muted}`}>
        What stylists and vendors owe StylistsCenter in booking fees and order commission. Balances
        are paid monthly in the app; use a row to record a cash or bank payment, or to correct a
        balance. Both are logged against your name.
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total owed"
          value={formatUsd(summary?.owedUsdCents ?? 0)}
          icon={<DollarSign size={20} />}
        />
        <StatTile
          label="Overdue"
          value={formatUsd(summary?.overdueUsdCents ?? 0)}
          icon={<AlertTriangle size={20} />}
          tone={(summary?.overdueUsdCents ?? 0) > 0 ? 'accent' : 'neutral'}
        />
        <StatTile
          label="Providers owing"
          value={summary?.providersOwing ?? 0}
          icon={<Users size={20} />}
        />
        <StatTile
          label="Restricted"
          value={summary?.restrictedCount ?? 0}
          icon={<Lock size={20} />}
          tone={(summary?.restrictedCount ?? 0) > 0 ? 'accent' : 'neutral'}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-white/5">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                setFilter(f.value);
                setOffset(0);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-dark-surface dark:text-dark-text'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-dark-muted dark:hover:text-dark-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          disabled={exporting}
          onClick={() => {
            void exportCsv();
          }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>
      {exportError ? <p className={`mb-4 ${errorText}`}>{exportError}</p> : null}

      <div className="mb-4">
        <SearchBox
          placeholder="Search name or phone"
          onSearch={(value) => {
            setQ(value);
            setOffset(0);
          }}
        />
      </div>
      {isLoading ? <p className={`text-sm ${muted}`}>Loading…</p> : null}
      {isError ? <p className={errorText}>Couldn&apos;t load fee balances.</p> : null}
      {!isLoading && data?.items.length === 0 ? (
        <p className={`text-sm ${muted}`}>Nothing here.</p>
      ) : null}

      <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 dark:divide-dark-border dark:border-dark-border">
        {data?.items.map((row) => (
          <FeeRow key={row.providerId} row={row} />
        ))}
      </div>
      {data ? (
        <Pager offset={offset} shown={data.items.length} total={data.total} onChange={setOffset} />
      ) : null}
    </div>
  );
}
