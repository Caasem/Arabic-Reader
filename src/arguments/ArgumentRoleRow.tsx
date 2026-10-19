import { ROLES } from './roles';
import { useArg } from './store';

/** The argument roles in the reader's selection bar, under the five colours. Each button applies its role to the selection. */
export function ArgumentRoleRow() {
  const { applyRole } = useArg();
  if (!applyRole) return null;
  return (
    <div className="arg-rolerow" role="group" aria-label="Argument role">
      {ROLES.map((r) => (
        <button key={r.id} type="button" title={`${r.label} (${r.key})`} onClick={() => applyRole(r.id)}>
          <kbd style={{ background: `var(--s-${r.id})` }}>{r.key}</kbd>
          {r.label}
        </button>
      ))}
    </div>
  );
}
