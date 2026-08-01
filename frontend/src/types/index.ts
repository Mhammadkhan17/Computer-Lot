export type UserRole = "retail" | "wholesale_pending" | "wholesale_approved" | "admin"

export type ItemGrade = "Grade_A" | "Grade_B" | "Grade_C" | "For_Parts"

export type OrderStatus = "pending_whatsapp" | "processing" | "completed" | "cancelled"

export interface Profile {
  id: string
  full_name: string
  company_name?: string
  tax_registration_id?: string
  role: UserRole
  phone?: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  title: string
  sku: string
  description?: string
  hardware_specifications: Record<string, unknown>
  grade: ItemGrade
  items_per_lot: number
  retail_price_per_lot: number
  wholesale_price_per_lot: number
  minimum_wholesale_lots: number
  available_stock_lots: number
  manifest_file_url?: string
  images?: string[]
  tags?: string[]
  created_at: string
  updated_at: string
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface Order {
  id: string
  readable_order_id: number
  user_id: string
  customer_name: string
  customer_phone: string
  total_amount: number
  status: OrderStatus
  created_at: string
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity_ordered: number
  unit_price_applied: number
}

export interface AdminOrderItem {
  id: string
  product_id: string
  quantity_ordered: number
  unit_price_applied: number
  products: { title: string } | null
}

export interface AdminOrder {
  id: string
  readable_order_id: number
  customer_name: string
  total_amount: number
  status: OrderStatus
  created_at: string
  order_items: AdminOrderItem[]
}

export interface AdminProfile {
  id: string
  full_name: string
  company_name?: string
  tax_registration_id?: string
  role: UserRole
  created_at: string
}

export interface CheckoutRequest {
  items: { product_id: string; quantity: number }[]
}

export interface CheckoutResponse {
  order_id: string
  readable_order_id: number
  total_amount: number
  whatsapp_deep_link: string
  items: OrderItem[]
}

export interface StockError {
  product_id: string
  title: string
  available: number
  requested: number
}

export interface CheckoutError {
  error: string
  out_of_stock?: StockError[]
}

export interface CsvImportResult {
  inserted: number
  errors: CsvImportError[]
  total_rows: number
}

export interface CsvImportError {
  row: number
  sku: string
  reason: string
}

export type ProductCsvColumn = keyof Pick<Product, "title" | "sku" | "description" | "grade" | "items_per_lot" | "retail_price_per_lot" | "wholesale_price_per_lot" | "minimum_wholesale_lots" | "available_stock_lots">
