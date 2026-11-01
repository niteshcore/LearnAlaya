// Where a fee stands, worked out from its payments so admin and parent screens always agree.
export const FEE_STATES = {
  overdue: { label: 'Overdue', tone: 'pending' },
  pending: { label: 'Due', tone: 'plain' },
  partial: { label: 'Part paid', tone: 'partial' },
  paid: { label: 'Paid', tone: 'done' },
  waived: { label: 'Waived', tone: 'muted' },
}

export function feeView(due, payments, today) {
  const own = payments.filter((payment) => payment.due_id === due.id)
  const paid = own.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const balance = Math.max(0, Number(due.amount) - paid)
  let state = 'pending'
  if (due.status === 'waived') state = 'waived'
  else if (balance === 0) state = 'paid'
  else if (due.due_date < today) state = 'overdue'
  else if (paid > 0) state = 'partial'
  return { ...due, payments: own, paid, balance: due.status === 'waived' ? 0 : balance, state }
}

export const isOpen = (fee) => fee.state === 'pending' || fee.state === 'partial' || fee.state === 'overdue'
