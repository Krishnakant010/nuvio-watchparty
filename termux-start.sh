#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# Nuvio Watch Party Server — 1-Click Termux Launcher for Android
# Runs a zero-overhead (<15MB RAM) coordination server directly on your phone!
# ==============================================================================

echo "🍿 Starting Nuvio Watch Party Server on Android (Termux)..."

# Ensure Node.js is installed
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    pkg update -y
    pkg install nodejs -y
fi

# Find Phone's local WiFi IP
PHONE_IP=$(ifconfig 2>/dev/null | grep -E "inet " | grep -v "127.0.0.1" | awk '{print $2}' | head -n 1)
if [ -z "$PHONE_IP" ]; then
    PHONE_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7}')
fi
if [ -z "$PHONE_IP" ]; then
    PHONE_IP="localhost"
fi

echo ""
echo "=========================================================="
echo "🚀 Watch Party Server Ready!"
echo "   Local WiFi IP:  $PHONE_IP"
echo "   TV & Phone URL: ws://$PHONE_IP:8089"
echo "   Room Code:      NUVIO1"
echo "=========================================================="
echo ""
echo "💡 Tip for remote friends (outside your home WiFi):"
echo "   Run in another Termux session:"
echo "   pkg install cloudflared -y && cloudflared tunnel --url http://localhost:8089"
echo "   and share the wss:// link with your partner!"
echo "=========================================================="
echo ""

# Start server
node server.mjs
