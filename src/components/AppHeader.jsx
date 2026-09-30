export default function AppHeader({ username, onSignOut }) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <strong>MEnU Meet</strong>
        <span className="muted">/{username || 'User'}</span>
      </div>
      <button className="button button-secondary button-small" onClick={onSignOut}>
        Sign out
      </button>
    </header>
  );
}
