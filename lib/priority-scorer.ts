import type { SupplierCategory } from './types/database'

const CATEGORY_WEIGHTS: Record<SupplierCategory, number> = {
  utenze: 10,
  stipendi: 10,
  tributi_f24: 9,
  leasing_noleggio: 8,
  affitti: 7,
  fornitori_bar: 6,
  professionisti: 5,
  manutenzione: 5,
  forniture: 4,
  assicurazioni: 4,
  intercompany: 3,
  altro: 3,
}

export function calculatePriorityScore(params: {
  category: SupplierCategory | null
  dueDate: string // YYYY-MM-DD
  isCritical: boolean
  acceptsPostponement: boolean
}): number {
  const { category, dueDate, isCritical, acceptsPostponement } = params

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))

  const categoryWeight = category ? (CATEGORY_WEIGHTS[category] ?? 3) : 3

  let overdueWeight = 0
  if (daysOverdue > 90) overdueWeight = 5
  else if (daysOverdue > 60) overdueWeight = 4
  else if (daysOverdue > 30) overdueWeight = 3
  else if (daysOverdue > 15) overdueWeight = 2
  else if (daysOverdue > 0) overdueWeight = 1

  const criticalBonus = isCritical ? 3 : 0
  const postponementDiscount = acceptsPostponement ? -2 : 0

  return Math.max(1, categoryWeight + overdueWeight + criticalBonus + postponementDiscount)
}

export function daysUntilDue(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  return Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
