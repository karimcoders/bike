// Set the OpenRouter API key on the LIVE site via the settings API.
// Run AFTER the new code is deployed to Vercel.
//
// Usage:  LIVE_COOKIE="bip_session=..." bun run scripts/set-ai-key-live.ts
//
// Or pass the cookie as arg:  bun run scripts/set-ai-key-live.ts "bip_session=..."

const BASE = "https://saranbike.vercel.app";
const OPENROUTER_KEY = "process.env.OPENROUTER_API_KEY";
const COOKIE = process.env.LIVE_COOKIE || process.argv[2];
if (!COOKIE) {
  console.error("Missing session cookie. Set LIVE_COOKIE env or pass as arg.");
  process.exit(1);
}
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  Cookie: COOKIE.startsWith("bip_session=") ? COOKIE : `bip_session=${COOKIE}`,
};

async function main() {
  // 1. Check if the new AI settings fields are deployed yet
  console.log("Checking live settings for AI fields...");
  const getRes = await fetch(`${BASE}/api/settings`, { headers });
  const getData = await getRes.json();
  const s = getData.settings || {};
  if (!("aiKeySet" in s)) {
    console.error("❌ New code not deployed yet. The 'aiKeySet' field is missing from /api/settings.");
    console.error("   Push the code to GitHub first, wait for Vercel to deploy (~2 min), then re-run this script.");
    process.exit(1);
  }
  console.log("✅ New AI settings fields are live on the site.");
  console.log(`   Current: provider=${s.aiProvider || "(none)"} keySet=${s.aiKeySet}`);

  // 2. Set the OpenRouter key
  console.log("\nSetting OpenRouter API key...");
  const putRes = await fetch(`${BASE}/api/settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      aiProvider: "openrouter",
      aiApiKey: OPENROUTER_KEY,
    }),
  });
  const putText = await putRes.text();
  if (!putRes.ok) {
    console.error(`❌ Failed to set key: ${putRes.status} ${putText.slice(0, 200)}`);
    process.exit(1);
  }
  console.log("✅ OpenRouter key saved to database.");

  // 3. Verify
  const verifyRes = await fetch(`${BASE}/api/settings`, { headers });
  const verifyData = await verifyRes.json();
  const vs = verifyData.settings || {};
  console.log(`\nVerification: provider=${vs.aiProvider} keySet=${vs.aiKeySet} maskedKey=${vs.aiApiKey}`);

  // 4. Test AI chat with a complex query (forces AI, not DB)
  console.log("\nTesting AI chat with a complex query...");
  const chatRes = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: "Mujhe ek chota sa business tip do aaj ke liye." }),
  });
  const chatData = await chatRes.json();
  console.log(`Provider: ${chatData.provider}`);
  console.log(`Reply: ${(chatData.reply || "").slice(0, 300)}`);

  if (chatData.provider === "openrouter") {
    console.log("\n🎉 SUCCESS! OpenRouter is now the active AI provider on the live site.");
  } else if (chatData.provider === "groq") {
    console.log("\n⚠️  Groq was used instead of OpenRouter. This is fine (fallback works), but OpenRouter should be tried first.");
    console.log("   The key may need a few seconds to propagate, or OpenRouter returned an error. Check /api/ai/usage.");
  } else {
    console.log(`\n⚠️  Provider was ${chatData.provider}. Check /api/ai/usage for errors.`);
  }

  // 5. Show usage stats
  const usageRes = await fetch(`${BASE}/api/ai/usage`, { headers });
  const usage = await usageRes.json();
  console.log("\nAI Provider Status:");
  for (const p of usage.providers) {
    console.log(`  ${p.name}: available=${p.available} ok=${p.successes} fail=${p.failures} ${p.lastError ? "err=" + p.lastError.slice(0, 60) : ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
