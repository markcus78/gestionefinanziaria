export type Company = {
  id: string
  code: string
  name: string
  legal_name: string | null
  is_active: boolean
  minimum_cash_threshold_cents: number
  created_at: string
}

export type UserRole = 'strategic' | 'operational' | 'supervisor'

export type UserProfile = {
  id: string
  email: string | null
  role: UserRole
  company_id: string | null
  created_at: string
}

export type BankAccount = {
  id: string
  company_id: string
  name: string
  iban: string | null
  is_active: boolean
  current_balance_cents: number
  balance_updated_at: string | null
  created_at: string
}

export type CashChannel = {
  id: string
  name: string
  default_commission_pct: number
  default_commission_fixed_cents: number
  avg_settlement_days: number
  created_at: string
}

export type CompanyCashChannel = {
  id: string
  company_id: string
  channel_id: string
  is_enabled: boolean
  custom_commission_pct: number | null
  custom_commission_fixed_cents: number | null
  custom_settlement_days: number | null
  bank_account_id: string | null
  payout_type: 'rolling_days' | 'fixed_weekday' | null
  payout_rolling_days: number | null
  payout_fixed_weekday: number | null
}

export type ChannelConfig = CompanyCashChannel & {
  cash_channels: CashChannel
}

export type PatternType = 'daily' | 'monthly' | 'subscription'

export type CollectionPattern = {
  id: string
  company_id: string
  channel_id: string | null
  pattern_type: PatternType
  day_of_month: number | null
  description: string | null
}

export type MonthlyRevenueForecast = {
  id: string
  company_id: string
  channel_id: string | null
  year: number
  month: number
  forecast_gross_cents: number
  created_by: string | null
  updated_at: string
}

export type DailyCollection = {
  id: string
  company_id: string
  channel_id: string
  collection_date: string
  gross_amount_cents: number
  commission_cents: number
  net_amount_cents: number
  transaction_count: number
  settlement_expected_date: string | null
  is_settled: boolean
  settled_date: string | null
  stripe_payment_intent_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type CollectionWithChannel = DailyCollection & {
  cash_channels: { name: string }
}

export type SupplierCategory =
  | 'utenze'
  | 'stipendi'
  | 'fornitori_bar'
  | 'affitti'
  | 'tributi_f24'
  | 'professionisti'
  | 'leasing_noleggio'
  | 'manutenzione'
  | 'forniture'
  | 'assicurazioni'
  | 'intercompany'
  | 'altro'

export type SupplierRegistry = {
  id: string
  company_id: string
  supplier_name: string
  supplier_code: string | null
  category: SupplierCategory | null
  is_critical: boolean
  default_priority: number | null
  accepts_postponement: boolean | null
  postponement_notes: string | null
  bank_iban: string | null
  created_at: string
  updated_at: string
}

export type ImportBatch = {
  id: string
  company_id: string
  imported_at: string
  imported_by: string | null
  file_name: string | null
  rows_imported: number | null
  rows_updated: number | null
  rows_new: number | null
  status: string
}

export type PaymentStatus = 'pending' | 'scheduled' | 'paid' | 'partial' | 'postponed' | 'disputed' | 'cancelled'
export type FlowType = 'in' | 'out'
export type EntryType = 'accounting' | 'commitment'

export type PaymentScheduleItem = {
  id: string
  company_id: string
  import_batch_id: string | null
  supplier_name: string | null
  supplier_code: string | null
  account_code: string | null
  account_description: string | null
  document_type: string | null
  document_number: string | null
  document_date: string | null
  due_date: string
  payment_method: string | null
  bank_description: string | null
  amount_cents: number
  amount_in_cents: number
  amount_out_cents: number
  flow_type: FlowType
  entry_type: EntryType
  is_intercompany: boolean
  counterpart_company_id: string | null
  status: PaymentStatus
  paid_date: string | null
  paid_amount_cents: number | null
  postponed_to: string | null
  postpone_notes: string | null
  priority_score: number | null
  priority_override: number | null
  supplier_id: string | null
  dedup_key: string
  created_at: string
  updated_at: string
  commitment_type?: CommitmentType | null
  recurring_template_id?: string | null
  reference_month?: string | null
  is_repayment_plan: boolean
}

export type ExpenseForecast = {
  id: string
  company_id: string
  category: string
  year: number
  month: number
  forecast_cents: number
  source: 'calculated' | 'manual'
  notes: string | null
  updated_at: string
}

export type IntercompanyNetting = {
  id: string
  netting_date: string
  created_by: string | null
  total_compensated_cents: number | null
  details: Record<string, unknown> | null
  created_at: string
}

export type AccessLogEventType = 'login' | 'logout'

export type AccessLog = {
  id: string
  user_id: string | null
  user_email: string
  user_role: string | null
  event_type: AccessLogEventType
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export type CommitmentType = 'forecast' | 'salary_item' | 'collab_item' | 'tax_item' | 'manual' | 'extra_item' | 'piva_item'

export type RecurringTemplate = {
  id: string
  company_id: string
  name: string
  category: 'salary' | 'collaborators' | 'tax' | 'utility' | 'other'
  amount_cents: number | null
  flow_type: 'in' | 'out'
  frequency: 'monthly' | 'quarterly' | 'annual'
  day_of_month: number
  active: boolean
  notes: string | null
  created_at: string
}

export type ReportType = 'bug' | 'domanda' | 'integrazione' | 'altro'
export type ReportStatus = 'aperta' | 'in_corso' | 'scartata' | 'risolta'

export type Report = {
  id: string
  created_at: string
  created_by: string | null
  author_email: string | null
  report_type: ReportType
  page: string
  description: string
  is_read: boolean
  status: ReportStatus
  notes: string | null
}
