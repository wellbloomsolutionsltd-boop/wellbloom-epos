# WELLBLOOM POS + ECOMMERCE — Project Structure

This document defines the recommended project structure for the WELLBLOOM EPOS + Ecommerce platform.

The architecture is designed so that:

- EPOS and Ecommerce share one backend.
- EPOS and Ecommerce share the same PostgreSQL database.
- Product, stock, pricing, customers, orders, sales, payments, and branches are centrally managed.
- The system can grow into a multi-tenant, multi-branch ERP/POS SaaS.
- Mobile apps can later use the same backend API.
- Pharmacy-specific functionality such as batch tracking, expiry control, FEFO, dead stock, inter-branch redistribution, procurement, and insurance can be added without redesigning the foundation.

---

# 1. Root Project Structure

```text
WELLBLOOM POS/
│
├── apps/
│   ├── api/
│   ├── web/
│   └── mobile/                     # Future Flutter/mobile apps
│
├── database/
│   └── prisma/
│
├── packages/
│   ├── shared/
│   ├── ui/
│   ├── config/
│   └── types/
│
├── docs/
│
├── scripts/
│
├── tests/
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── prisma.config.ts
├── tsconfig.json
├── README.md
└── structure.md
```

---

# 2. Applications

## 2.1 Backend API

```text
apps/
└── api/
    │
    ├── src/
    │   │
    │   ├── main.ts
    │   ├── app.module.ts
    │   │
    │   ├── prisma/
    │   │   ├── prisma.module.ts
    │   │   └── prisma.service.ts
    │   │
    │   ├── auth/
    │   │   ├── auth.module.ts
    │   │   ├── auth.controller.ts
    │   │   ├── auth.service.ts
    │   │   ├── dto/
    │   │   ├── guards/
    │   │   ├── strategies/
    │   │   └── decorators/
    │   │
    │   ├── tenants/
    │   │   ├── tenants.module.ts
    │   │   ├── tenants.controller.ts
    │   │   ├── tenants.service.ts
    │   │   └── dto/
    │   │
    │   ├── branches/
    │   │   ├── branches.module.ts
    │   │   ├── branches.controller.ts
    │   │   ├── branches.service.ts
    │   │   └── dto/
    │   │
    │   ├── users/
    │   │   ├── users.module.ts
    │   │   ├── users.controller.ts
    │   │   ├── users.service.ts
    │   │   └── dto/
    │   │
    │   ├── roles/
    │   │   ├── roles.module.ts
    │   │   ├── roles.controller.ts
    │   │   ├── roles.service.ts
    │   │   └── permissions/
    │   │
    │   ├── products/
    │   │   ├── products.module.ts
    │   │   ├── products.controller.ts
    │   │   ├── products.service.ts
    │   │   └── dto/
    │   │
    │   ├── categories/
    │   │   ├── categories.module.ts
    │   │   ├── categories.controller.ts
    │   │   ├── categories.service.ts
    │   │   └── dto/
    │   │
    │   ├── brands/
    │   │   ├── brands.module.ts
    │   │   ├── brands.controller.ts
    │   │   ├── brands.service.ts
    │   │   └── dto/
    │   │
    │   ├── inventory/
    │   │   ├── inventory.module.ts
    │   │   ├── inventory.controller.ts
    │   │   ├── inventory.service.ts
    │   │   └── dto/
    │   │
    │   ├── batches/
    │   │   ├── batches.module.ts
    │   │   ├── batches.controller.ts
    │   │   ├── batches.service.ts
    │   │   └── dto/
    │   │
    │   ├── stock-movements/
    │   │   ├── stock-movements.module.ts
    │   │   ├── stock-movements.controller.ts
    │   │   ├── stock-movements.service.ts
    │   │   └── dto/
    │   │
    │   ├── stock-transfers/
    │   │   ├── stock-transfers.module.ts
    │   │   ├── stock-transfers.controller.ts
    │   │   ├── stock-transfers.service.ts
    │   │   └── dto/
    │   │
    │   ├── suppliers/
    │   │   ├── suppliers.module.ts
    │   │   ├── suppliers.controller.ts
    │   │   ├── suppliers.service.ts
    │   │   └── dto/
    │   │
    │   ├── procurement/
    │   │   ├── procurement.module.ts
    │   │   ├── purchase-orders.controller.ts
    │   │   ├── purchase-orders.service.ts
    │   │   ├── goods-received.controller.ts
    │   │   ├── goods-received.service.ts
    │   │   └── dto/
    │   │
    │   ├── replenishment/
    │   │   ├── replenishment.module.ts
    │   │   ├── replenishment.controller.ts
    │   │   ├── replenishment.service.ts
    │   │   └── dto/
    │   │
    │   ├── expiry/
    │   │   ├── expiry.module.ts
    │   │   ├── expiry.controller.ts
    │   │   ├── expiry.service.ts
    │   │   └── rules/
    │   │
    │   ├── dead-stock/
    │   │   ├── dead-stock.module.ts
    │   │   ├── dead-stock.controller.ts
    │   │   ├── dead-stock.service.ts
    │   │   └── recommendations/
    │   │
    │   ├── sales/
    │   │   ├── sales.module.ts
    │   │   ├── sales.controller.ts
    │   │   ├── sales.service.ts
    │   │   └── dto/
    │   │
    │   ├── returns/
    │   │   ├── returns.module.ts
    │   │   ├── returns.controller.ts
    │   │   ├── returns.service.ts
    │   │   └── dto/
    │   │
    │   ├── payments/
    │   │   ├── payments.module.ts
    │   │   ├── payments.controller.ts
    │   │   ├── payments.service.ts
    │   │   └── integrations/
    │   │
    │   ├── customers/
    │   │   ├── customers.module.ts
    │   │   ├── customers.controller.ts
    │   │   ├── customers.service.ts
    │   │   └── dto/
    │   │
    │   ├── prescriptions/
    │   │   ├── prescriptions.module.ts
    │   │   ├── prescriptions.controller.ts
    │   │   ├── prescriptions.service.ts
    │   │   └── dto/
    │   │
    │   ├── insurance/
    │   │   ├── insurance.module.ts
    │   │   ├── insurance.controller.ts
    │   │   ├── insurance.service.ts
    │   │   └── providers/
    │   │
    │   ├── shifts/
    │   │   ├── shifts.module.ts
    │   │   ├── shifts.controller.ts
    │   │   ├── shifts.service.ts
    │   │   └── dto/
    │   │
    │   ├── end-of-day/
    │   │   ├── end-of-day.module.ts
    │   │   ├── end-of-day.controller.ts
    │   │   ├── end-of-day.service.ts
    │   │   └── dto/
    │   │
    │   ├── reports/
    │   │   ├── reports.module.ts
    │   │   ├── reports.controller.ts
    │   │   ├── reports.service.ts
    │   │   └── queries/
    │   │
    │   ├── ecommerce/
    │   │   ├── ecommerce.module.ts
    │   │   ├── catalog.controller.ts
    │   │   ├── catalog.service.ts
    │   │   └── pricing/
    │   │
    │   ├── carts/
    │   │   ├── carts.module.ts
    │   │   ├── carts.controller.ts
    │   │   ├── carts.service.ts
    │   │   └── dto/
    │   │
    │   ├── orders/
    │   │   ├── orders.module.ts
    │   │   ├── orders.controller.ts
    │   │   ├── orders.service.ts
    │   │   └── dto/
    │   │
    │   ├── promotions/
    │   │   ├── promotions.module.ts
    │   │   ├── promotions.controller.ts
    │   │   ├── promotions.service.ts
    │   │   └── dto/
    │   │
    │   ├── pricing/
    │   │   ├── pricing.module.ts
    │   │   ├── pricing.controller.ts
    │   │   ├── pricing.service.ts
    │   │   └── rules/
    │   │
    │   ├── receipts/
    │   │   ├── receipts.module.ts
    │   │   ├── receipts.controller.ts
    │   │   ├── receipts.service.ts
    │   │   └── templates/
    │   │
    │   ├── notifications/
    │   │   ├── notifications.module.ts
    │   │   ├── notifications.service.ts
    │   │   └── channels/
    │   │
    │   ├── accounting/
    │   │   ├── accounting.module.ts
    │   │   ├── accounting.controller.ts
    │   │   ├── accounting.service.ts
    │   │   └── integrations/
    │   │       ├── xero/
    │   │       └── sap/
    │   │
    │   ├── audit/
    │   │   ├── audit.module.ts
    │   │   ├── audit.service.ts
    │   │   └── audit.interceptor.ts
    │   │
    │   ├── integrations/
    │   │   ├── mpesa/
    │   │   ├── card/
    │   │   ├── email/
    │   │   ├── sms/
    │   │   ├── etims/
    │   │   ├── xero/
    │   │   └── sap/
    │   │
    │   ├── health/
    │   │   ├── health.controller.ts
    │   │   └── health.module.ts
    │   │
    │   └── common/
    │       ├── decorators/
    │       ├── guards/
    │       ├── interceptors/
    │       ├── filters/
    │       ├── pipes/
    │       ├── constants/
    │       ├── enums/
    │       └── utils/
    │
    ├── test/
    │
    ├── package.json
    ├── tsconfig.json
    └── nest-cli.json
```

---

# 3. Web Application

The web app contains:

- Ecommerce storefront
- EPOS cashier
- Admin dashboard
- Branch management
- Inventory management
- Procurement
- Reports
- Ecommerce administration

```text
apps/
└── web/
    │
    ├── src/
    │   │
    │   ├── app/
    │   │   │
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   ├── globals.css
    │   │   │
    │   │   ├── (store)/
    │   │   │   ├── page.tsx
    │   │   │   ├── shop/
    │   │   │   ├── category/
    │   │   │   ├── product/
    │   │   │   ├── cart/
    │   │   │   ├── checkout/
    │   │   │   ├── account/
    │   │   │   ├── orders/
    │   │   │   └── search/
    │   │   │
    │   │   ├── pos/
    │   │   │   ├── page.tsx
    │   │   │   ├── Receipt.tsx
    │   │   │   ├── components/
    │   │   │   │   ├── BarcodeInput.tsx
    │   │   │   │   ├── ProductSearch.tsx
    │   │   │   │   ├── CartTable.tsx
    │   │   │   │   ├── CartItem.tsx
    │   │   │   │   ├── SaleSummary.tsx
    │   │   │   │   ├── PaymentModal.tsx
    │   │   │   │   ├── ReceiptModal.tsx
    │   │   │   │   └── CustomerSelector.tsx
    │   │   │   │
    │   │   │   ├── sales/
    │   │   │   ├── returns/
    │   │   │   ├── shifts/
    │   │   │   ├── end-of-day/
    │   │   │   └── settings/
    │   │   │
    │   │   ├── admin/
    │   │   │   ├── page.tsx
    │   │   │   ├── products/
    │   │   │   ├── categories/
    │   │   │   ├── brands/
    │   │   │   ├── inventory/
    │   │   │   ├── batches/
    │   │   │   ├── branches/
    │   │   │   ├── users/
    │   │   │   ├── customers/
    │   │   │   ├── suppliers/
    │   │   │   ├── procurement/
    │   │   │   ├── transfers/
    │   │   │   ├── replenishment/
    │   │   │   ├── expiry/
    │   │   │   ├── dead-stock/
    │   │   │   ├── promotions/
    │   │   │   ├── sales/
    │   │   │   ├── payments/
    │   │   │   ├── reports/
    │   │   │   ├── ecommerce/
    │   │   │   ├── accounting/
    │   │   │   ├── audit/
    │   │   │   └── settings/
    │   │   │
    │   │   └── api/
    │   │
    │   ├── components/
    │   │   ├── ui/
    │   │   ├── navigation/
    │   │   ├── forms/
    │   │   ├── tables/
    │   │   ├── modals/
    │   │   └── charts/
    │   │
    │   ├── lib/
    │   │   ├── api.ts
    │   │   ├── auth.ts
    │   │   ├── currency.ts
    │   │   ├── formatting.ts
    │   │   └── validation.ts
    │   │
    │   ├── hooks/
    │   │
    │   ├── services/
    │   │   ├── products.service.ts
    │   │   ├── inventory.service.ts
    │   │   ├── sales.service.ts
    │   │   ├── customers.service.ts
    │   │   └── orders.service.ts
    │   │
    │   ├── store/
    │   │
    │   └── types/
    │
    ├── public/
    │   ├── images/
    │   ├── icons/
    │   ├── logos/
    │   └── fonts/
    │
    ├── package.json
    └── tsconfig.json
```

---

# 4. Database Structure

```text
database/
└── prisma/
    │
    ├── schema.prisma
    ├── seed.ts
    │
    └── migrations/
        ├── 20260916103510_initial_core/
        │   └── migration.sql
        │
        └── ...
```

The Prisma schema will eventually contain models for:

```text
Tenant
Branch
User
Role
Permission

Product
Category
Brand
ProductImage
ProductPrice

Inventory
InventoryBatch
StockMovement
StockTransfer
StockTransferItem

Supplier
PurchaseOrder
PurchaseOrderItem
GoodsReceivedNote
GoodsReceivedItem

Sale
SaleItem
Payment
Return
ReturnItem

Customer
CustomerAddress
CustomerAccount

Cart
CartItem
Order
OrderItem

Shift
CashDrawer
EndOfDay

Promotion
PromotionRule

Prescription
InsuranceProvider
InsuranceClaim

Notification
AuditLog

AccountingEntry
IntegrationSync
```

---

# 5. Shared Packages

```text
packages/
│
├── shared/
│   ├── constants/
│   ├── enums/
│   ├── helpers/
│   └── validation/
│
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Modal.tsx
│   ├── Table.tsx
│   └── ...
│
├── types/
│   ├── product.ts
│   ├── inventory.ts
│   ├── sale.ts
│   ├── customer.ts
│   └── order.ts
│
└── config/
    ├── eslint/
    ├── typescript/
    └── environment/
```

---

# 6. Documentation

```text
docs/
│
├── architecture/
│   ├── system-overview.md
│   ├── database-design.md
│   ├── api-design.md
│   └── security.md
│
├── pos/
│   ├── cashier-flow.md
│   ├── payments.md
│   ├── returns.md
│   ├── shifts.md
│   └── end-of-day.md
│
├── ecommerce/
│   ├── storefront.md
│   ├── checkout.md
│   └── order-flow.md
│
├── inventory/
│   ├── inventory.md
│   ├── batch-tracking.md
│   ├── fefo.md
│   ├── expiry-management.md
│   ├── dead-stock.md
│   └── transfers.md
│
├── procurement/
│   ├── suppliers.md
│   ├── purchase-orders.md
│   ├── goods-received.md
│   └── replenishment.md
│
├── deployment/
│   ├── local-development.md
│   ├── staging.md
│   ├── production.md
│   └── backup-recovery.md
│
└── manuals/
    ├── cashier-user-manual.md
    ├── manager-user-manual.md
    ├── admin-user-manual.md
    └── stock-controller-user-manual.md
```

---

# 7. Scripts

```text
scripts/
│
├── seed-dev.ts
├── create-admin.ts
├── reset-database.ts
├── import-products.ts
├── import-stock.ts
├── export-products.ts
└── backup-database.ps1
```

---

# 8. Testing Structure

```text
tests/
│
├── unit/
│   ├── products/
│   ├── inventory/
│   ├── sales/
│   ├── payments/
│   └── orders/
│
├── integration/
│   ├── product-api/
│   ├── sales-api/
│   ├── inventory-api/
│   └── ecommerce-api/
│
└── e2e/
    ├── pos-sale.spec.ts
    ├── pos-return.spec.ts
    ├── ecommerce-order.spec.ts
    └── stock-sync.spec.ts
```

---

# 9. EPOS MVP Modules

The first MVP should be built in this order:

```text
MODULE 1
Core Database + Tenant + Branch

MODULE 2
Products + Basic Inventory

MODULE 3
Product API + Barcode Lookup

MODULE 4
EPOS Cashier Screen

MODULE 5
Sales + Sale Items + Payments

MODULE 6
Thermal Receipt + Printing

MODULE 7
Sales History + Receipt Reprint

MODULE 8
Users + Cashiers + Roles

MODULE 9
Cashier Shifts + Cash Drawer

MODULE 10
End Of Day

MODULE 11
Returns + Refunds

MODULE 12
Customers

MODULE 13
Basic Reports

MODULE 14
Ecommerce ↔ EPOS Stock Synchronization

MODULE 15
M-Pesa + Card Payment Integration

MODULE 16
Production Hardening + MVP Deployment
```

---

# 10. Enterprise Modules After MVP

After the first operational MVP, build:

```text
Advanced Inventory
Batch Tracking
Expiry Tracking
FEFO
Near-Expiry Alerts
Short-Expiry Alerts

Dead Stock Detection
Slow-Moving Stock
Dead Stock Recommendations
Intelligent Inter-Branch Dead Stock Redistribution

Stock Transfers
Transfer Approval
Transfer Receiving
Transfer Audit Trail

Suppliers
Purchase Orders
Goods Received Notes
Supplier Returns

Dynamic Min/Max Replenishment
Recommended Ordering
Branch Reorder Parameters
HQ Replenishment
Redistribution Before Ordering

Promotions
Discount Rules
Price Lists
Branch Pricing
POS Pricing
Ecommerce Pricing

Prescription Management
Insurance Processing

Hospital Pharmacy Features
Supermarket Features

Accounting
Xero Integration
SAP Integration

Advanced Reports
Dashboards
Forecasting
Analytics

Audit Logs
Security
Multi-Tenant Administration

Mobile EPOS
Mobile Ecommerce
Management Mobile App
```

---

# 11. Shared Backend Architecture

```text
                       WELLBLOOM PLATFORM

                         PostgreSQL
                             │
                             ▼
                      NestJS Backend API
                             │
          ┌──────────────────┼───────────────────┐
          │                  │                   │
          ▼                  ▼                   ▼
       EPOS Web         Ecommerce Web       Admin Portal
          │                  │                   │
          └──────────────────┼───────────────────┘
                             │
                             ▼
                       Same Backend
                             │
                             ▼
                       Same Database
```

Later:

```text
                      NestJS Backend API
                             │
      ┌──────────────┬───────┼──────────┬──────────────┐
      │              │       │          │              │
      ▼              ▼       ▼          ▼              ▼
     EPOS         Ecommerce  Admin    Mobile POS    Mobile Store
```

---

# 12. Shared Inventory Principle

EPOS and Ecommerce must not maintain separate stock databases.

Example:

```text
MAGNESIUM TABLETS

Main Branch Stock
25 units
```

If EPOS sells:

```text
4 units
```

PostgreSQL becomes:

```text
21 units
```

Both systems then see:

```text
EPOS       = 21
Ecommerce  = 21
Admin      = 21
```

This database is the single source of truth.

---

# 13. Future Inventory Architecture

The simple MVP Inventory model will later evolve into:

```text
Product
   │
   ├── Branch
   │     │
   │     ├── Inventory Summary
   │     │
   │     └── Inventory Batches
   │            │
   │            ├── Batch Number
   │            ├── Quantity
   │            ├── Cost
   │            ├── Manufacture Date
   │            ├── Expiry Date
   │            └── FEFO Priority
   │
   └── Stock Movements
         │
         ├── Purchase
         ├── Sale
         ├── Return
         ├── Transfer Out
         ├── Transfer In
         ├── Adjustment
         ├── Damage
         ├── Expiry
         └── Disposal
```

---

# 14. Sales Architecture

```text
Sale
│
├── Sale Number
├── Receipt Number
├── Tenant
├── Branch
├── Cashier
├── Customer
├── Subtotal
├── Discount
├── Tax
├── Total
├── Status
│
├── Sale Items
│   ├── Product
│   ├── Batch
│   ├── Quantity
│   ├── Unit Price
│   ├── Discount
│   └── Line Total
│
└── Payments
    ├── Cash
    ├── M-Pesa
    ├── Card
    ├── Bank
    ├── Insurance
    └── Other
```

---

# 15. POS Cashier Flow

```text
Login
  ↓
Select/Open Shift
  ↓
Scan Barcode
  ↓
Product Lookup
  ↓
Check Branch Stock
  ↓
Add To Cart
  ↓
Set Quantity
  ↓
Apply Discount If Authorized
  ↓
Select Customer If Needed
  ↓
Proceed To Payment
  ↓
Cash / M-Pesa / Card / Other
  ↓
Complete Sale
  ↓
Database Transaction
  ↓
Reduce Inventory
  ↓
Create Sale
  ↓
Create Sale Items
  ↓
Create Payments
  ↓
Generate Receipt
  ↓
Print Receipt
  ↓
New Sale
```

---

# 16. Ecommerce Order Flow

```text
Customer
   ↓
Browse Products
   ↓
Product Page
   ↓
Add To Cart
   ↓
Cart
   ↓
Checkout
   ↓
Delivery Details
   ↓
Payment
   ↓
Order Created
   ↓
Inventory Reserved
   ↓
Order Confirmed
   ↓
Fulfilment
   ↓
Inventory Deducted
   ↓
Delivery / Pickup
```

---

# 17. Branch Structure

```text
Tenant
│
├── Branch A
│   ├── Users
│   ├── Inventory
│   ├── Batches
│   ├── Sales
│   ├── Returns
│   ├── Shifts
│   └── Transfers
│
├── Branch B
│   ├── Users
│   ├── Inventory
│   ├── Batches
│   ├── Sales
│   ├── Returns
│   ├── Shifts
│   └── Transfers
│
└── Branch C
    ├── Users
    ├── Inventory
    ├── Batches
    ├── Sales
    ├── Returns
    ├── Shifts
    └── Transfers
```

---

# 18. Multi-Tenant SaaS Structure

```text
WELLBLOOM PLATFORM
│
├── Tenant A
│   ├── Branch A1
│   ├── Branch A2
│   └── Branch A3
│
├── Tenant B
│   ├── Branch B1
│   └── Branch B2
│
└── Tenant C
    └── Branch C1
```

Each tenant must be logically isolated from all others.

Every tenant-owned business record should eventually contain a tenant identifier where appropriate.

---

# 19. Security Layers

Future production structure should include:

```text
Authentication
Authorization
Role-Based Access Control
Permission-Based Access
Tenant Isolation
Branch Restrictions
Password Hashing
Session/JWT Security
Rate Limiting
Validation
Audit Logging
Sensitive Data Protection
Database Backups
HTTPS
Environment Secrets
Payment Security
Admin Activity Tracking
```

---

# 20. User Roles

Initial roles:

```text
SUPER_ADMIN
TENANT_ADMIN
MANAGER
PHARMACIST
CASHIER
INVENTORY_MANAGER
PROCUREMENT_OFFICER
ACCOUNTANT
ECOMMERCE_MANAGER
REPORT_VIEWER
```

Permissions will later be configurable.

Example:

```text
Cashier
├── Create Sale
├── View Own Sales
├── Print Receipt
└── Process Return With Approval

Manager
├── All Cashier Rights
├── Discounts
├── Void Sale
├── Approve Returns
├── Open/Close Shift
├── End Of Day
└── View Branch Reports
```

---

# 21. Current Development Status

Completed / working foundation:

```text
✓ PostgreSQL installed
✓ Database created
✓ Prisma 7 configured
✓ Prisma PostgreSQL adapter configured
✓ Tenant model
✓ Branch model
✓ Product model
✓ Inventory model
✓ Seed script
✓ Initial tenant created
✓ Main branch created
✓ Test product created
✓ Test inventory created
✓ Product API
✓ Barcode product lookup
✓ EPOS cart
✓ Sale model
✓ SaleItem model
✓ Payment model
✓ Sale transaction
✓ Server-side price calculation
✓ Server-side stock verification
✓ Stock deduction
✓ Payment recording
✓ Receipt number generation
✓ Thermal receipt work started
```

Next:

```text
→ Complete thermal receipt
→ Sales history
→ Receipt reprint
→ Users
→ Cashier login
→ Roles
→ Shifts
→ End Of Day
```

---

# 22. Development Rule

As development continues:

1. Do not create duplicate backend logic for EPOS and Ecommerce.
2. Do not create separate stock databases.
3. Business rules belong primarily in the backend.
4. The frontend must not be trusted for prices or stock validation.
5. Important stock and financial operations must use database transactions.
6. Every stock movement must eventually be traceable.
7. Every sale/payment/return/transfer must be auditable.
8. Every business record must respect tenant isolation.
9. Branch-specific inventory must remain separate.
10. Build the smallest working MVP first, then progressively add enterprise functionality.

---

# 23. Recommended Root View

The final repository should gradually resemble:

```text
WELLBLOOM POS/
│
├── apps/
│   ├── api/
│   ├── web/
│   └── mobile/
│
├── database/
│   └── prisma/
│
├── packages/
│   ├── shared/
│   ├── ui/
│   ├── types/
│   └── config/
│
├── docs/
│
├── scripts/
│
├── tests/
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── prisma.config.ts
├── tsconfig.json
├── README.md
└── structure.md
```

---

# 24. Immediate Next Build Step

Continue with:

```text
MODULE 6
Thermal Receipt + Printing

then

MODULE 7
Sales History + Receipt Reprint
```

After these two modules, continue into:

```text
Users
Authentication
Roles
Cashier Shifts
End Of Day
Returns
Customers
Reports
```

That sequence keeps the project focused on reaching the first operational MVP as quickly as possible while preserving the enterprise architecture needed for the full WELLBLOOM ERP/POS + Ecommerce platform.
