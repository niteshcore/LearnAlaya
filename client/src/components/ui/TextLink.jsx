import ActionLink from './ActionLink.jsx'
import ArrowIcon from './ArrowIcon.jsx'

export default function TextLink({ children, ...props }) {
  return <ActionLink className="text-link" {...props}>{children} <ArrowIcon /></ActionLink>
}
