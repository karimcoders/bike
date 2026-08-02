#!/bin/bash
# Start dev server, run agent-browser UI test for AI product-add, screenshot.
cd /home/z/my-project

echo "=== Killing old server ==="
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "bun run dev" 2>/dev/null
sleep 1

echo "=== Starting dev server ==="
nohup bun run dev > /home/z/my-project/dev.log 2>&1 &
disown

echo "=== Waiting for server ==="
UP=0
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
  if [ "$code" = "200" ]; then echo "Server UP after ${i}s"; UP=1; break; fi
  sleep 1
done
[ "$UP" = "1" ] || { echo "SERVER FAILED TO START"; tail -15 dev.log; exit 1; }

echo "=== Open login page ==="
agent-browser open http://localhost:3000/ --timeout 30000 2>&1 | tail -2
sleep 3

echo "=== Fill login form ==="
agent-browser find label "Username" fill "admin" 2>&1 | tail -1
agent-browser find label "Password" fill "admin123" 2>&1 | tail -1
sleep 1
echo "=== Click Login ==="
agent-browser find role button click --name "Login" 2>&1 | tail -1
sleep 6

echo "=== Screenshot dashboard ==="
agent-browser screenshot /home/z/my-project/ui-dashboard.png --full 2>&1 | tail -1

echo "=== Navigate to AI Assistant ==="
agent-browser find role button click --name "AI Assistant" 2>&1 | tail -1
sleep 4
agent-browser snapshot -i -c 2>&1 | head -15

echo ""
echo "=== Set chat input via JS + submit form (ref-independent) ==="
agent-browser eval '(function(){ var el = document.querySelector("input[placeholder*=ShopMitra]"); if(!el){ return "INPUT_NOT_FOUND"; } var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, "ek naya product add karo bhai: NGK Spark Plug, brand NGK, bike Pulsar 150, category Electrical, purchase price 120, selling price 250, quantity 30 pcs, min stock 8, supplier Shivam Auto Parts"); el.dispatchEvent(new Event("input", { bubbles: true })); setTimeout(function(){ var form = el.closest("form"); if(form){ form.requestSubmit(); } }, 200); return "OK len=" + el.value.length; })()' 2>&1 | tail -3

echo "=== Waiting for AI reply (45s) ==="
sleep 45

echo "=== Screenshot AI reply ==="
agent-browser screenshot /home/z/my-project/ui-ai-reply.png --full 2>&1 | tail -1

echo ""
echo "=== Get page text to verify reply ==="
agent-browser get text body 2>&1 | tail -25

echo ""
echo "=== Navigate to Products ==="
agent-browser find role button click --name "Products" 2>&1 | tail -1
sleep 3
agent-browser screenshot /home/z/my-project/ui-products.png --full 2>&1 | tail -1

echo ""
echo "=== Console errors ==="
agent-browser errors 2>&1 | head -8 || echo "none"

echo ""
echo "=== Cleanup ==="
pkill -9 -f "next-server" 2>/dev/null
echo "DONE"
