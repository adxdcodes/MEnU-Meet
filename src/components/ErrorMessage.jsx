export default function ErrorMessage({ children, className = '' }) {
  if (!children) return null;
  return <div className={`error-message ${className}`}>{children}</div>;
}
