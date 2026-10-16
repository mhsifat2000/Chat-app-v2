/**
 * FlashChat - WebRTC Peer-to-Peer & Lazy QR Engine (p2p.js)
 * Enables direct device-to-device communication on GitHub Pages without a backend server.
 * Lazy-loads QR scanner only when the scanner modal is opened.
 */

(function () {
  'use strict';

  // Google public STUN servers for NAT traversal (no server required)
  const RTC_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  let peerConnection = null;
  let dataChannel = null;
  let qrScannerStream = null;
  let qrScannerInterval = null;
  let onMessageCallback = null;
  let onStatusCallback = null;

  /**
   * Initialize a new RTCPeerConnection
   */
  function initPeerConnection() {
    if (peerConnection) {
      try { peerConnection.close(); } catch (e) {}
    }

    peerConnection = new RTCPeerConnection(RTC_CONFIG);

    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      if (onStatusCallback) onStatusCallback(state);
    };

    peerConnection.ondatachannel = (event) => {
      setDataChannel(event.channel);
    };

    return peerConnection;
  }

  /**
   * Bind event handlers to WebRTC DataChannel
   */
  function setDataChannel(channel) {
    dataChannel = channel;

    dataChannel.onopen = () => {
      console.log('P2P DataChannel OPEN');
      if (onStatusCallback) onStatusCallback('connected');
    };

    dataChannel.onclose = () => {
      console.log('P2P DataChannel CLOSED');
      if (onStatusCallback) onStatusCallback('disconnected');
    };

    dataChannel.onerror = (err) => {
      console.error('DataChannel error:', err);
    };

    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (onMessageCallback) onMessageCallback(data);
      } catch (e) {
        console.error('Error parsing incoming P2P message', e);
      }
    };
  }

  /**
   * Create WebRTC Offer (Person A initiates)
   */
  async function createOffer() {
    initPeerConnection();

    // Create DataChannel on initiator side
    const channel = peerConnection.createDataChannel('chat', {
      ordered: true
    });
    setDataChannel(channel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Wait for ICE candidates gathering to produce a self-contained token
    await waitForIceGathering(peerConnection);

    return JSON.stringify(peerConnection.localDescription);
  }

  /**
   * Create WebRTC Answer (Person B receives Offer and responds)
   */
  async function createAnswer(offerString) {
    initPeerConnection();

    const offer = JSON.parse(offerString);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await waitForIceGathering(peerConnection);

    return JSON.stringify(peerConnection.localDescription);
  }

  /**
   * Accept Answer (Person A accepts Person B's answer)
   */
  async function acceptAnswer(answerString) {
    if (!peerConnection) throw new Error('No active connection');
    const answer = JSON.parse(answerString);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Helper: Wait until ICE gathering is complete
   */
  function waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
        // Fallback timeout after 3 seconds for speed on mobile
        setTimeout(() => resolve(), 3000);
      }
    });
  }

  /**
   * Send a message through active WebRTC DataChannel
   */
  function sendP2PMessage(data) {
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }

  /**
   * Check if P2P channel is connected
   */
  function isConnected() {
    return dataChannel && dataChannel.readyState === 'open';
  }

  /**
   * Lazy load QR Code library only when needed
   */
  function loadQrLibrary() {
    if (window.QRCode) return Promise.resolve(window.QRCode);

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
      script.async = true;
      script.onload = () => resolve(window.QRCode);
      script.onerror = () => reject(new Error('Failed to load QR generator'));
      document.head.appendChild(script);
    });
  }

  /**
   * Lazy load QR Scanner library only when scanner modal is opened
   * Uses native BarcodeDetector API if supported (0KB download!), or lazy-loads html5-qrcode
   */
  function loadQrScannerLibrary() {
    if ('BarcodeDetector' in window) {
      return Promise.resolve({ type: 'native' });
    }
    if (window.Html5Qrcode) {
      return Promise.resolve({ type: 'library' });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => resolve({ type: 'library' });
      script.onerror = () => reject(new Error('Failed to load QR scanner'));
      document.head.appendChild(script);
    });
  }

  /**
   * Render QR Code to container
   */
  async function renderQrCode(containerId, text) {
    try {
      const QRCodeLib = await loadQrLibrary();
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';
      
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);

      await QRCodeLib.toCanvas(canvas, text, {
        width: 220,
        margin: 1,
        color: {
          dark: '#0e1621',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.warn('QR render error, fallback to code:', err);
    }
  }

  /**
   * Start Camera QR Scanner (loads on-demand)
   */
  async function startQrScanner(videoElementId, onScanSuccess, onError) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (onError) onError(new Error('Camera hardware or permissions not accessible in this browser.'));
      return;
    }

    try {
      const scannerType = await loadQrScannerLibrary();
      
      if (scannerType.type === 'native') {
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const video = document.getElementById(videoElementId);
        
        qrScannerStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        video.srcObject = qrScannerStream;
        await video.play();

        qrScannerInterval = setInterval(async () => {
          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
              const barcodes = await barcodeDetector.detect(video);
              if (barcodes.length > 0) {
                stopQrScanner(videoElementId);
                onScanSuccess(barcodes[0].rawValue);
              }
            } catch (e) {}
          }
        }, 250);
      } else {
        // html5-qrcode fallback
        const html5QrCode = new window.Html5Qrcode(videoElementId);
        window._activeScanner = html5QrCode;
        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            stopQrScanner(videoElementId);
            onScanSuccess(decodedText);
          },
          () => {} // scan pass
        );
      }
    } catch (err) {
      console.warn('Camera access unavailable:', err);
      if (onError) onError(err);
    }
  }

  /**
   * Scan QR code from an image or screenshot file (Zero camera permission required)
   */
  async function scanQrImage(file, onScanSuccess, onError) {
    try {
      const scannerType = await loadQrScannerLibrary();
      if (scannerType.type === 'native') {
        const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(file);
        const barcodes = await barcodeDetector.detect(bitmap);
        if (barcodes && barcodes.length > 0) {
          onScanSuccess(barcodes[0].rawValue);
        } else {
          throw new Error('No QR code found in the image.');
        }
      } else {
        const html5QrCode = new window.Html5Qrcode('scannerTarget');
        const decodedText = await html5QrCode.scanFile(file, true);
        onScanSuccess(decodedText);
      }
    } catch (err) {
      console.warn('QR image scan failed:', err);
      if (onError) onError(err);
    }
  }

  /**
   * Stop Camera QR Scanner & release hardware
   */
  function stopQrScanner(videoElementId) {
    if (qrScannerInterval) {
      clearInterval(qrScannerInterval);
      qrScannerInterval = null;
    }
    if (qrScannerStream) {
      qrScannerStream.getTracks().forEach((t) => t.stop());
      qrScannerStream = null;
    }
    if (window._activeScanner) {
      try {
        window._activeScanner.stop().then(() => {
          window._activeScanner.clear();
          window._activeScanner = null;
        });
      } catch (e) {}
    }
    const video = document.getElementById(videoElementId);
    if (video) video.srcObject = null;
  }

  /**
   * Compact URL-safe Token Encoding
   */
  function encodeToken(obj) {
    try {
      const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
      return btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (e) {
      return typeof obj === 'string' ? obj : JSON.stringify(obj);
    }
  }

  /**
   * Universal URL-safe Token Decoding
   * Accepts full URLs, base64 strings, or raw JSON objects
   */
  function decodeToken(input) {
    if (!input) return null;
    let str = (typeof input === 'string' ? input : JSON.stringify(input)).trim();

    // Remove wrapping quotes if user pasted with quotes
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
      str = str.slice(1, -1).trim();
    }

    // Extract token from full URL
    if (str.includes('#connect=')) {
      str = str.split('#connect=')[1].split('&')[0];
    } else if (str.includes('#answer=')) {
      str = str.split('#answer=')[1].split('&')[0];
    }

    // If it's already a JSON string (e.g. {"type":"offer",...})
    if (str.startsWith('{') && str.endsWith('}')) {
      try {
        return JSON.parse(str);
      } catch (e) {}
    }

    // Try base64 decoding
    try {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch (e) {
      // Fallback: try direct JSON parse
      try {
        return JSON.parse(str);
      } catch (err) {
        throw new Error('Unrecognized link or token format');
      }
    }
  }

  /**
   * Build 1-click shareable connect URL for Person A (Offer)
   */
  function createConnectLink(offerString) {
    const token = encodeToken(offerString);
    const base = window.location.href.split('#')[0];
    return `${base}#connect=${token}`;
  }

  /**
   * Build 1-click shareable answer URL for Person B (Answer)
   */
  function createAnswerLink(answerString) {
    const token = encodeToken(answerString);
    const base = window.location.href.split('#')[0];
    return `${base}#answer=${token}`;
  }

  // Export module
  window.P2P = {
    createOffer,
    createAnswer,
    acceptAnswer,
    sendP2PMessage,
    isConnected,
    renderQrCode,
    startQrScanner,
    stopQrScanner,
    scanQrImage,
    encodeToken,
    decodeToken,
    createConnectLink,
    createAnswerLink,
    onMessage: (cb) => { onMessageCallback = cb; },
    onStatus: (cb) => { onStatusCallback = cb; }
  };
})();
