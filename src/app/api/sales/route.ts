import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";

// GET /api/sales — list sales (with filters: ?days=30&limit=100)
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") || "30");
    const limit = Number(url.searchParams.get("limit") || "100");
    const start = new Date(Date.now() - days * 86400000);

    const sales = await db.sale.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: { include: { product: { select: { id: true, name: true, photo: true, location: { select: { code: true } } } } } },
        customer: { select: { id: true, name: true, type: true, phone: true } },
        user: { select: { name: true } },
      },
    });
    return ok({ sales });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch sales", 500);
  }
}

// POST /api/sales — record a sale with payment (decrements stock, creates ledger for credit)
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const {
      items,
      customerId,
      note,
      invoiceNo,
      paymentMode = "CASH",
      paidAmount,
      discount = 0,
      cashAmount = 0,
      upiAmount = 0,
      creditAmount = 0,
      dueDate,
    } = await req.json();

    if (!Array.isArray(items) || items.length === 0)
      return err("At least one sale item required");

    // Validate stock availability and gather product snapshots
    const validated: {
      productId: string;
      name: string;
      price: number;
      purchasePrice: number;
      quantity: number;
      subtotal: number;
    }[] = [];
    let subtotalSum = 0;
    let profit = 0;

    for (const it of items) {
      const qty = Number(it.quantity);
      if (!it.productId || !qty || qty <= 0)
        return err("Invalid item in sale");
      const product = await db.product.findUnique({ where: { id: it.productId } });
      if (!product) return err(`Product not found`, 404);
      if (product.quantity < qty)
        return err(`Only ${product.quantity} ${product.name} in stock`);
      const price = it.price != null ? Number(it.price) : product.sellingPrice;
      const subtotal = price * qty;
      subtotalSum += subtotal;
      profit += (price - product.purchasePrice) * qty;
      validated.push({
        productId: product.id,
        name: product.name,
        price,
        purchasePrice: product.purchasePrice,
        quantity: qty,
        subtotal,
      });
    }

    const disc = Number(discount) || 0;
    const total = Math.max(0, subtotalSum - disc);

    // Determine payment status + amounts based on mode
    let finalPaidAmount = Number(paidAmount) || 0;
    let finalCash = Number(cashAmount) || 0;
    let finalUpi = Number(upiAmount) || 0;
    let finalCredit = Number(creditAmount) || 0;
    let status: string = "PAID";

    if (paymentMode === "CASH") {
      // cashAmount is the ACTUAL amount of cash the customer handed over
      // (e.g. ₹200 for a ₹120 bill). We must NOT overwrite it with `total`
      // — otherwise the receipt's "Return (वापस दें)" line, which is
      // computed as `cashAmount - total`, is always 0 and the shopkeeper
      // never sees how much change to give back. If the client didn't send
      // a cashAmount (e.g. older frontend), default to `total` (exact pay).
      finalCash = Number(cashAmount) > 0 ? Number(cashAmount) : total;
      finalPaidAmount = total; // the bill itself is fully settled
      status = "PAID";
    } else if (paymentMode === "UPI") {
      finalUpi = total;
      finalPaidAmount = total;
      status = "PAID";
    } else if (paymentMode === "CREDIT") {
      finalCredit = total;
      finalPaidAmount = 0;
      status = "PENDING";
    } else if (paymentMode === "SPLIT") {
      // Split: cashAmount + upiAmount + creditAmount should equal total
      const sum = finalCash + finalUpi + finalCredit;
      finalPaidAmount = finalCash + finalUpi;
      if (finalCredit > 0) {
        status = finalPaidAmount > 0 ? "PARTIAL" : "PENDING";
      } else {
        status = "PAID";
      }
      // If user didn't specify split amounts, treat as cash
      if (sum === 0) {
        finalCash = total;
        finalPaidAmount = total;
        status = "PAID";
      }
    }

    // Create sale
    const sale = await db.sale.create({
      data: {
        invoiceNo: invoiceNo || `INV-${Date.now()}`,
        customerId: customerId || null,
        userId: user.id,
        subtotal: subtotalSum,
        discount: disc,
        total,
        profit,
        itemCount: validated.length,
        note: note || "",
        paymentMode,
        paidAmount: finalPaidAmount,
        cashAmount: finalCash,
        upiAmount: finalUpi,
        creditAmount: finalCredit,
        dueDate: dueDate ? new Date(dueDate) : null,
        status,
        items: { create: validated },
      },
      include: { items: true, customer: { select: { id: true, name: true, phone: true, type: true } } },
    });

    // Decrement stock + create movements + update lastSoldAt
    for (const it of validated) {
      await db.product.update({
        where: { id: it.productId },
        data: {
          quantity: { decrement: it.quantity },
          lastSoldAt: new Date(),
        },
      });
      await db.movement.create({
        data: {
          productId: it.productId,
          type: "REMOVED",
          quantity: -it.quantity,
          reason: "Sale",
          note: `Sale ${sale.invoiceNo}`,
          userId: user.id,
        },
      });
    }

    // If credit sale, create ledger entry + update customer outstanding
    if (finalCredit > 0 && customerId) {
      const customer = await db.customer.findUnique({ where: { id: customerId } });
      if (customer) {
        const newBalance = customer.outstanding + finalCredit;
        await db.ledgerEntry.create({
          data: {
            customerId,
            saleId: sale.id,
            type: "CREDIT",
            amount: finalCredit,
            balance: newBalance,
            note: `Sale ${sale.invoiceNo}`,
            dueDate: dueDate ? new Date(dueDate) : null,
            userId: user.id,
          },
        });
        await db.customer.update({
          where: { id: customerId },
          data: { outstanding: newBalance },
        });
      }
    }

    // If customer paid advance earlier, and now paying via cash/upi, we could adjust
    // (kept simple: advance is separate, applied via ledger endpoint)

    return ok({ sale }, 201);
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    console.error(e);
    return err("Failed to record sale", 500);
  }
}
