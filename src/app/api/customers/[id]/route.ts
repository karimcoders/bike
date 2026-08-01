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
