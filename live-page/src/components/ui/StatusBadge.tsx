import { statusLabel, statusBadgeClass } from '../../lib/utils';

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}
