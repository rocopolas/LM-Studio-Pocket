# LM Studio Pocket

LM Studio Pocket is a Web App designed to connect you remotely (from your phone or any device) to your local **LM Studio** server.

Featuring a premium "mobile-first" design, dark mode, and *glassmorphism* aesthetics, it allows you to comfortably chat with your LLMs, manage your models, and process images.


## 🚀 Quick Install (One Command)

> **Prerequisites:** [Node.js](https://nodejs.org/) and [Docker](https://docs.docker.com/engine/install/) must be installed.

```bash
git clone https://github.com/rocopolas/lm-studio-pocket.git && cd lm-studio-pocket && chmod +x install.sh && ./install.sh
```

This single command will:
- Install all npm dependencies
- Pull and configure a **SearXNG** Docker container for web search
- Auto-detect your LAN IP and create the `.env` file
- Print next steps to get started

After installation, start the app with:
```bash
npm run dev
```

---

## 📖 Manual Setup

If you prefer to set things up yourself, follow these steps:

### 1. Setup LM Studio
1. Open **LM Studio** on your computer.
2. Go to the **Developer / Local Server** tab.
3. Make sure the **CORS (Cross-Origin Resource Sharing)** option is enabled.
4. Enable the option for the server to listen on your **local network** (On local network). This allows access from your phone.
5. Click on **Start Server** (defaults to port `1234`).

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Open the `.env` file and **set your LM Studio server IP address**:
```env
VITE_SERVER_URL=http://[IP_ADDRESS]:1234
```

### 4. Setup SearXNG (Optional — for Web Search)

Pull and run the SearXNG Docker container:
```bash
mkdir -p searxng
cat > searxng/settings.yml << 'EOF'
use_default_settings: true
search:
  formats:
    - html
    - json
server:
  secret_key: "your-secret-key"
  limiter: false
  image_proxy: true
  port: 8080
  bind_address: "0.0.0.0"
EOF

docker run -d \
  --name searxng-pocket \
  --restart unless-stopped \
  -p 8080:8080 \
  -v $(pwd)/searxng/settings.yml:/etc/searxng/settings.yml:ro \
  docker.io/searxng/searxng:latest
```

### 5. Start the App
```bash
npm run dev
```
*(The server is exposed to your local network by default).*

### 6. Access from Your Phone
1. Make sure your phone is connected to the **same WiFi** as your computer.
2. Open the browser on your phone and enter your computer's IP address followed by the Vite port (e.g., `http://192.168.1.100:5173`).
3. (Optional) Tap the 3 dots in your mobile browser and select **"Add to Home Screen"** to use it as a native app.
4. In the app, open the sidebar > **Settings**, and make sure the **Server URL** points to your PC's IP in LM Studio (e.g., `http://192.168.1.100:1234`).
5. Enable **Web Search** in Settings to use SearXNG.
6. Start chatting!
