# LM Studio Pocket

LM Studio Pocket is a Progressive Web App (PWA) designed to connect you remotely (from your phone or any device) to your local **LM Studio** server.

Featuring a premium "mobile-first" design, dark mode, and *glassmorphism* aesthetics, it allows you to comfortably chat with your LLMs, manage your models, and process images.


## 🚀 Installation and Usage 

### 1. Setup LM Studio
1. Open **LM Studio** on your computer.
2. Go to the **Developer / Local Server** tab.
3. Make sure the **CORS (Cross-Origin Resource Sharing)** option is enabled.
4. Enable the option for the server to listen on your **local network** (On local network). This allows access from your phone.
5. Click on **Start Server** (defaults to port `1234`).

### 2. Run LM Studio Pocket
The app uses Vite for blazing-fast development and to easily handle environment variables.

1. Open a terminal in the project folder and **install dependencies**:
```bash
npm install
```

2. Open the `.env` file and **set your LM Studio server IP address** if you want it to be automatically configured when you open the app on your phone:
```env
VITE_SERVER_URL=http://[IP_ADDRESS]
```

3. **Start the server**:
```bash
npm run dev -- --host
```
*(The `--host` flag exposes the app to your local network).*

### 3. Access from your phone
1. Make sure your phone is connected to the **same WiFi** as your computer.
2. Open the browser on your phone and enter your computer's IP address followed by the *serve/python* port (example: `http://192.168.1.100:3000`).
3. (Optional) Tap the 3 dots in your mobile browser and select **"Add to Home Screen"** to use it as a native app.
4. In the app, open the sidebar > **Settings**, and make sure the **Server URL** points to your PC's IP in LM Studio (e.g., `http://192.168.1.100:1234`).
5. Start chatting!
