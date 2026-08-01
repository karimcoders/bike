import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/customers/[id]/ledger — list ledger entries
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const ledger = await db.ledgerEntry.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        sale: { select: { id: true, invoiceNo: true, total: true } },
      },
    });
    return ok({ ledger });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch ledger", 500);
  }
}

// POST /api/customers/[id]/ledger — record payment / advance / adjustment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id: customerId } = await params;
    const { type, amount, note, dueDate } = await req.json();

    if (!type || !["PAYMENT", "ADVANCE", "ADJUSTMENT"].includes(type))
      return err("Invalid ledger type (use PAYMENT, ADVANCE, or ADJUSTMENT)");
    const amt = Number(amount);
    if (!amt || amt <= 0) return err("Amount must be positive");

    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return err("Customer not found", 404);

    // Compute new balance
    // PAYMENT: customer pays outstanding -> reduces outstanding (or adds to advance if overpaid)
    // ADVANCE: customer gives advance -> increases advance
    // ADJUSTMENT: manual correction (amount positive = increase outstanding, negative logic via type)
    let newOutstanding = customer.outstanding;
    let newAdvance = customer.advance;
    let ledgerAmount = amt;
    let ledgerBalance: number;

    if (type === "PAYMENT") {
      // Payment reduces outstanding first, excess goes to advance
      if (amt >= customer.outstanding) {
        const excess = amt - customer.outstanding;
        newOutstanding = 0;
        newAdvance = customer.advance + excess;
      } else {
        newOutstanding = customer.outstanding - amt;
      }
      ledgerAmount = -amt; // negative = customer paid (reduces what they owe)
      ledgerBalance = newOutstanding;
    } else if (type === "ADVANCE") {
      newAdvance = customer.advance + amt;
      ledgerAmount = -amt; // negative = customer gave us money in advance
      ledgerBalance = newOutstanding;
    } else {
      // ADJUSTMENT: positive amount increases outstanding (correction)
      newOutstanding = customer.outstanding + amt;
      ledgerAmount = amt;
      ledgerBalance = newOutstanding;
    }

    const entry = await db.ledgerEntry.create({
      data: {
        customerId,
        type,
        amount: ledgerAmount,
        balance: ledgerBalance,
        note: note || "",
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: user.id,
      },
    });

    await db.customer.update({
      where: { id: customerId },
      data: { outstanding: newOutstanding, advance: newAdvance },
    });

    return ok({ entry, outstanding: newOutstanding, advance: newAdvance }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to record ledger entry", 500);
  }
}
