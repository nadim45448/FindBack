import { statusColors } from '@/ui/tokens';

/**
 * Walking skeleton home page.
 *
 * The frozen UX contract for the anonymous landing page lives in
 * EXPERIENCE.md §16. This placeholder proves the app renders; it is replaced by
 * the real landing surface in bolt 012-web-public.
 */
export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '48px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '32px', lineHeight: 1.2 }}>FindBack</h1>
      <p style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
        Lost and found for the campus community.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          padding: '12px 16px',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          background: 'var(--surface)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '999px',
            background: statusColors.report.Open.icon,
          }}
        />
        <span style={{ fontSize: '13px', fontWeight: 600 }}>Environment ready</span>
      </div>
    </main>
  );
}
