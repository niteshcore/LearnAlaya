export default function Badge({ suit = 'A', children }) {
  return <div className="portal-badge">{suit} <span>{children}</span></div>
}
