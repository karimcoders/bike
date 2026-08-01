import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/customers — list customers with outstanding summary
export async function GET() {
  try {
    await requireUser();
    const customers = await db.customer.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { sales: true } } },
    });
    return ok({ customers });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch customers", 500);
  }
}

// POST /api/customers — create customer (any logged-in user can, for POS flow)
export async function POST(req: Request) {
  try {
    await requireUser();
    const { name, phone, type, notes } = await req.json();
    if (!name) return err("Customer name required");
    const customer = await db.customer.create({
      data: { name, phone: phone || "", type: type || "MECHANIC", notes: notes || "" },
    });
    return ok({ customer }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to create customer", 500);
  }
}
