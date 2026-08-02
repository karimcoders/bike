import { requireUser } from "@/lib/auth";
import { err, handleAuthError, ok } from "@/lib/api";
import { getUsageStats, hasAIProvider } from "@/lib/ai";

// GET /api/ai/usage — AI provider usage stats + health
// Returns per-provider request counts, success/failure rates, cooldown status,
// and which providers are currently available.
export async function GET() {
  try {
    await requireUser();
    const stats = getUsageStats();
    const aiAvailable = await hasAIProvider();
    return ok({
      ...stats,
      aiAvailable,
      message: aiAvailable
        ? "AI providers active — smart routing enabled."
        : "No AI provider configured. DB queries still work (stock, prices, sales). Set GROQ_API_KEY or GOOGLE_GENERATED_AI_API_KEY for AI features.",
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return err("Failed to fetch usage stats", 500);
  }
}
