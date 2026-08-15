import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/customers/[id] — customer with ledger + recent sales
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const customer = await db.customer.findUnique({
      where: { id },
      include: {
        ledger: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            sale: { select: { id: true, invoiceNo: true, total: true } },
          },
        },
        sales: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: {
            items: { take: 5 },
          },
        },
        _count: { select: { sales: true } },
      },
    });
    if (!customer) return err("Customer not found", 404);
    return ok({ customer });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch customer", 500);
  }
}

// DELETE /api/customers/[id] — delete a customer
// ---------------------------------------------------------------------
// Schema cascades:
//   - LedgerEntry.customerId  → onDelete: Cascade  (ledger entries removed)
//   - Sale.customerId         → onDelete: SetNull  (sales preserved, unlinked)
// So deleting a customer is safe: their past sales remain (customerId set
// to null), and their ledger entries are removed. We block deletion only
// when the customer has an outstanding credit balance or advance, to
// prevent accidental loss of unsettled udhaar accounting.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const existing = await db.customer.findUnique({ where: { id } });
    if (!existing) return err("Customer not found", 404);

    // Guard against deleting a customer with unsettled balance
    if (existing.outstanding > 0 || existing.advance > 0) {
      return err(
        `Cannot delete: this customer has an unsettled balance (outstanding ₹${existing.outstanding}, advance ₹${existing.advance}). Settle the account first.`,
        400
      );
    }

    // Safe to delete — ledger entries cascade, sales are unlinked (SetNull)
    await db.customer.delete({ where: { id } });
    return ok({ success: true });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to delete customer", 500);
  }
}
