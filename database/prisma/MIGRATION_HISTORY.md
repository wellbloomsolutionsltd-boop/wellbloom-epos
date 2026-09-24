# Prisma migration history

The migration directory is the source of truth for the Wellbloom database schema. Commit every migration directory and `migration_lock.toml`; do not edit applied migration SQL.

## 2026-09-24 ordering repair

The cash-drawer migration was originally named:

```text
20260917124947_add_cash_drawer_ledger
```

Its SQL adds `CashDrawerMovement_shiftId_fkey`, which references `Shift`. The `Shift` table is created by `20260917141000_add_cashier_shifts`, so a fresh lexical replay attempted the cash-drawer migration too early and failed with PostgreSQL `42P01` (`relation "Shift" does not exist`).

The local database had succeeded because `20260917141000_add_cashier_shifts` was applied before the back-dated cash-drawer migration. To make the recorded history reproducible, the cash-drawer directory was renamed without changing `migration.sql` to:

```text
20260917142000_add_cash_drawer_ledger
```

The SQL checksum is unchanged. Only the migration name and its ordering changed.

### Existing databases created before the repair

Before deploying the renamed history to any existing development, staging, or production database:

1. Take and verify a database backup.
2. Confirm the old migration name exists exactly once and the new name does not exist:

   ```sql
   SELECT migration_name, finished_at, rolled_back_at
   FROM "_prisma_migrations"
   WHERE migration_name IN (
     '20260917124947_add_cash_drawer_ledger',
     '20260917142000_add_cash_drawer_ledger'
   );
   ```

3. Reconcile the successful migration record in one transaction:

   ```sql
   BEGIN;

   UPDATE "_prisma_migrations"
   SET migration_name = '20260917142000_add_cash_drawer_ledger'
   WHERE migration_name = '20260917124947_add_cash_drawer_ledger'
     AND finished_at IS NOT NULL
     AND rolled_back_at IS NULL;

   COMMIT;
   ```

4. Require an affected-row count of exactly one. If either name is duplicated, both names exist, or the old migration is failed/rolled back, stop and investigate instead of forcing the update.
5. Run `npx prisma migrate status`.
6. For staging or production, run `npx prisma migrate deploy`; do not run `migrate dev` there.

`prisma migrate resolve` cannot rename this record because Prisma only permits resolving failed migrations, while this migration completed successfully.

### Normal lifecycle

- Development: use `npx prisma migrate dev` only against a development database. Prisma uses a shadow database to replay history and detect drift.
- Staging/production: use `npx prisma migrate deploy`. It applies pending migrations without a shadow database and does not reset data.
- Verification: run `npx prisma migrate status` after deployment.
- Never configure the shadow database URL to point at the real application database.
- Never use `prisma migrate reset` against staging or production.
