# P2P Instant WebRTC Chat

A serverless, ultra-fast, peer-to-peer messaging and file sharing web application built purely with **plain HTML, CSS, and JavaScript**. Zero build step, zero backend required. Designed to be hosted for free on **GitHub Pages**, **Netlify**, or **Cloudflare Pages**.

## Features

- **100% Serverless Peer-to-Peer**: Direct browser-to-browser connection using WebRTC DataChannels.
- **Easy Pairing Options**:
  - High-density QR code scanning (instant connection on mobile).
  - Shortened invite link sharing (copy & paste offer/answer).
  - Manual SDP / ICE payload exchange with easy one-click copy.
- **High Performance & Low Resource**:
  - Virtualized message rendering (loads latest 50 messages, infinite scroll history).
  - Single-DOM updates without full chat redraws (60 FPS on cheap mobile devices).
  - Progressive IndexedDB storage for offline caching and fast persistence.
  - Chunked image transfer with real-time transfer progress bars (auto-resizes to 1280px / 70% JPEG quality).
- **Delivery Receipts & Timestamps**:
  - Sent, Delivered, and Read tick status indicators.
  - Smart date separators ("Today", "Yesterday", or formatted calendar date).
- **Offline PWA Support**:
  - Built-in Service Worker (`sw.js`) for instant reload and offline capability.

## Files

- `index.html` - App interface and layout
- `style.css` - Mobile-first responsive styling
- `app.js` - UI logic, DOM manipulation, pagination, image compression
- `p2p.js` - WebRTC peer connection, signaling, chunked data protocol, and QR reader
- `db.js` - Lightweight IndexedDB storage engine
- `sw.js` - Service Worker for offline caching

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `p2p-chat`).
2. Push or upload these files to the `main` branch.
3. In GitHub, go to **Settings** > **Pages**.
4. Under **Build and deployment**, select **Source: Deploy from a branch**.
5. Select branch **`main`** and folder **`/ (root)`**, then click **Save**.
6. Your app will be live with free HTTPS (required for camera and WebRTC) within 1-2 minutes!
