import ActionLink from './ActionLink.jsx'
import ArrowIcon from './ArrowIcon.jsx'

export default function Button({ variant = 'dark', className = '', arrow = true, children, ...props }) {
  return (
    <ActionLink className={`button button-${variant} ${className}`.trim()} {...props}>
      {children}{arrow && <> <ArrowIcon /></>}
    </ActionLink>
  )
}
