export default function PageLoader({ label = 'Loading…' }) {
  return (
    <main className="center-page">
      <div className="loader-card">
        <div className="spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </main>
  );
}
