import { Placeholder } from '../../_components/placeholder';
import { CheckForUpdatesButton } from '../../_components/update-prompt';
export const metadata = { title: 'Settings' };
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <Placeholder title="Settings" phase="Phase 1+">
        Account, timezone, currency, and update controls.
      </Placeholder>
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
          Updates
        </span>
        <CheckForUpdatesButton />
      </div>
    </div>
  );
}
