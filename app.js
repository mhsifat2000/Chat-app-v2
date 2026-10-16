/**
 * FlashChat - Main Application Controller (app.js)
 * Stage 2: WebRTC Direct P2P, On-Demand QR Scanner & BroadcastChannel.
 * Zero external libraries or framework dependencies.
 */

(function () {
  'use strict';

  // State
  let activeConversationId = null;
  let oldestLoadedTimestamp = null;
  let hasOlderMessages = true;
  let isLoadingOlder = false;
  let currentOfferString = null;
  let localUserId = 'user_' + Math.floor(Math.random() * 10000);

  // BroadcastChannel for instant local cross-tab P2P testing
  const broadcastChannel = typeof BroadcastChannel !== 'undefined' 
    ? new BroadcastChannel('flashchat_p2p_channel') 
    : null;

  // DOM Elements cache
  const elements = {
    sidebar: document.getElementById('sidebar'),
    conversationsList: document.getElementById('conversationsList'),
    messagesViewport: document.getElementById('messagesViewport'),
    messagesContainer: document.getElementById('messagesContainer'),
    topSentinel: document.getElementById('topSentinel'),
    topSpinner: document.getElementById('topSpinner'),
    topLoadingLabel: document.getElementById('topLoadingLabel'),
    scrollBottomBtn: document.getElementById('scrollBottomBtn'),
    messageInput: document.getElementById('messageInput'),
    composerForm: document.getElementById('composerForm'),
    sendBtn: document.getElementById('sendBtn'),
    mobileBackBtn: document.getElementById('mobileBackBtn'),
    activeAvatar: document.getElementById('activeAvatar'),
    activeChatTitle: document.getElementById('activeChatTitle'),
    activeChatSubtitle: document.getElementById('activeChatSubtitle'),
    newChatBtn: document.getElementById('newChatBtn'),
    connectPeerBtn: document.getElementById('connectPeerBtn'),
    headerStatusDot: document.getElementById('headerStatusDot'),
    headerStatusText: document.getElementById('headerStatusText'),
    connectModal: document.getElementById('connectModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    tabShowQr: document.getElementById('tabShowQr'),
    tabScanQr: document.getElementById('tabScanQr'),
    tabCode: document.getElementById('tabCode'),
    paneShowQr: document.getElementById('paneShowQr'),
    paneScanQr: document.getElementById('paneScanQr'),
    paneCode: document.getElementById('paneCode'),
    qrContainer: document.getElementById('qrContainer'),
    copyOfferBtn: document.getElementById('copyOfferBtn'),
    copyOfferSuccess: document.getElementById('copyOfferSuccess'),
    answerInput: document.getElementById('answerInput'),
    applyAnswerBtn: document.getElementById('applyAnswerBtn'),
    scannerVideo: document.getElementById('scannerVideo'),
    scannerStatus: document.getElementById('scannerStatus'),
    manualOfferText: document.getElementById('manualOfferText'),
    manualAnswerText: document.getElementById('manualAnswerText'),
    manualConnectBtn: document.getElementById('manualConnectBtn'),
    cameraFallbackCard: document.getElementById('cameraFallbackCard'),
    fallbackToCodeBtn: document.getElementById('fallbackToCodeBtn'),
    qrFileInput: document.getElementById('qrFileInput'),
    qrFileInputAlt: document.getElementById('qrFileInputAlt'),
    attachBtn: document.getElementById('attachBtn'),
    imageInput: document.getElementById('imageInput'),
    copyConnectLinkBtn: document.getElementById('copyConnectLinkBtn'),
    shareConnectLinkBtn: document.getElementById('shareConnectLinkBtn'),
    pasteFromClipboardBtn: document.getElementById('pasteFromClipboardBtn'),
    linkCopiedToast: document.getElementById('linkCopiedToast'),
    directConnectUrlInput: document.getElementById('directConnectUrlInput'),
    searchInput: document.getElementById('searchInput')
  };

  /**
   * Format timestamp
   */
  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Helper to get a stable calendar date key (YYYY-MM-DD)
   */
  function getDateKey(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /**
   * Format human-readable date separator label (Today, Yesterday, or formatted date)
   */
  function formatDateSeparator(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  /**
   * Create date separator DOM element
   */
  function createDateSeparatorNode(timestamp) {
    const div = document.createElement('div');
    div.className = 'date-separator';
    div.dataset.dateKey = getDateKey(timestamp);
    const span = document.createElement('span');
    span.textContent = formatDateSeparator(timestamp);
    div.appendChild(span);
    return div;
  }

  /**
   * Create single message DOM node with timestamp displayed NEXT to the bubble
   */
  function createMessageNode(msg) {
    const isSent = msg.sender === 'me' || msg.sender === localUserId;
    const row = document.createElement('div');
    row.className = `message-row ${isSent ? 'sent' : 'received'}`;
    row.id = `msg-${msg.id}`;
    row.dataset.timestamp = msg.timestamp;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Image wrapper if photo exists
    if (msg.image) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'message-image-wrapper';
      const img = document.createElement('img');
      img.className = 'message-image';
      img.src = msg.image;
      img.alt = 'Photo';
      imgWrap.appendChild(img);
      bubble.appendChild(imgWrap);
    }

    // Text if present
    if (msg.text) {
      const textDiv = document.createElement('div');
      textDiv.className = 'message-text';
      textDiv.textContent = msg.text;
      bubble.appendChild(textDiv);
    }

    // Transfer Progress Bar if active
    if (msg.isTransferring) {
      const progressBox = document.createElement('div');
      progressBox.className = 'transfer-progress-box';
      progressBox.id = `progress-${msg.id}`;
      progressBox.innerHTML = `
        <div class="progress-track">
          <div class="progress-bar-fill" style="width: ${msg.progress || 0}%"></div>
        </div>
        <div class="progress-label">
          <span>${msg.transferLabel || 'Sending...'}</span>
          <span>${msg.progress || 0}%</span>
        </div>
      `;
      bubble.appendChild(progressBox);
    }

    // Formatted timestamp placed next to each message bubble
    const timeSpan = document.createElement('span');
    timeSpan.className = 'bubble-side-time';
    timeSpan.textContent = formatTime(msg.timestamp);

    if (isSent) {
      // Sent message: side timestamp and ticks displayed to the left of the sent bubble
      const sideMeta = document.createElement('div');
      sideMeta.className = 'bubble-side-meta';
      sideMeta.appendChild(timeSpan);

      const tickSpan = document.createElement('span');
      tickSpan.id = 'tick-' + msg.id;
      const status = msg.status || 'sent';
      tickSpan.className = 'status-tick ' + status;
      tickSpan.innerHTML = (status === 'read' || status === 'delivered') ? '✓✓' : '✓';
      sideMeta.appendChild(tickSpan);

      row.appendChild(sideMeta);
      row.appendChild(bubble);
    } else {
      // Received message: bubble first, timestamp placed directly to its right
      row.appendChild(bubble);
      row.appendChild(timeSpan);
    }

    return row;
  }

  /**
   * Update message tick indicator ('sent', 'delivered', 'read')
   */
  function updateMessageTick(messageId, status) {
    const tick = document.getElementById('tick-' + messageId);
    if (tick) {
      if (tick.classList.contains('read') && status === 'delivered') return;
      tick.className = 'status-tick ' + status;
      tick.innerHTML = (status === 'read' || status === 'delivered') ? '✓✓' : '✓';
    }
    window.DB.updateMessageStatus(messageId, status);
  }

  /**
   * Append a new message to the screen one by one with auto date separator
   */
  function appendMessageToDOM(msg, isPrepend = false) {
    const msgDateKey = getDateKey(msg.timestamp);

    if (isPrepend) {
      const node = createMessageNode(msg);
      elements.messagesContainer.insertBefore(node, elements.messagesContainer.firstChild);
    } else {
      // Check last message in container to see if a date separator is needed
      const lastMsg = elements.messagesContainer.querySelector('.message-row:last-of-type');
      let needSeparator = false;

      if (!lastMsg) {
        needSeparator = true;
      } else {
        const lastTimestamp = parseInt(lastMsg.dataset.timestamp, 10);
        if (getDateKey(lastTimestamp) !== msgDateKey) {
          needSeparator = true;
        }
      }

      if (needSeparator) {
        elements.messagesContainer.appendChild(createDateSeparatorNode(msg.timestamp));
      }

      const node = createMessageNode(msg);
      elements.messagesContainer.appendChild(node);
      scrollToBottomIfNear();
    }
  }

  /**
   * Scroll to bottom smoothly
   */
  function scrollToBottomIfNear(force = false) {
    const vp = elements.messagesViewport;
    const distanceFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
    if (force || distanceFromBottom < 160) {
      vp.scrollTop = vp.scrollHeight;
    }
  }

  /**
   * Load the latest 50 messages with grouped date separators
   */
  async function loadConversationMessages(conversationId) {
    activeConversationId = conversationId;
    elements.messagesContainer.innerHTML = '';
    oldestLoadedTimestamp = null;
    hasOlderMessages = true;
    elements.topLoadingLabel.textContent = 'Scroll up for older messages';

    const result = await window.DB.getLatestMessages(conversationId, 50);
    const msgs = result.messages;
    hasOlderMessages = result.hasMore;

    if (msgs.length > 0) {
      oldestLoadedTimestamp = msgs[0].timestamp;
      const fragment = document.createDocumentFragment();
      let lastDateKey = null;

      for (let i = 0; i < msgs.length; i++) {
        const currentMsg = msgs[i];
        const dateKey = getDateKey(currentMsg.timestamp);

        if (dateKey !== lastDateKey) {
          fragment.appendChild(createDateSeparatorNode(currentMsg.timestamp));
          lastDateKey = dateKey;
        }

        fragment.appendChild(createMessageNode(currentMsg));
      }

      elements.messagesContainer.appendChild(fragment);
      scrollToBottomIfNear(true);
    }

    if (!hasOlderMessages) {
      elements.topLoadingLabel.textContent = 'Beginning of chat history';
      elements.topSpinner.classList.add('hidden');
    }
  }

  /**
   * Load up to 50 older messages on scroll-up with date separators
   */
  async function loadOlderMessages() {
    if (!hasOlderMessages || isLoadingOlder || !activeConversationId || !oldestLoadedTimestamp) return;

    isLoadingOlder = true;
    elements.topSpinner.classList.remove('hidden');
    elements.topLoadingLabel.textContent = 'Loading older messages...';

    const vp = elements.messagesViewport;
    const prevScrollHeight = vp.scrollHeight;

    try {
      const result = await window.DB.getOlderMessages(activeConversationId, oldestLoadedTimestamp, 50);
      const olderMsgs = result.messages;
      hasOlderMessages = result.hasMore;

      if (olderMsgs.length > 0) {
        oldestLoadedTimestamp = olderMsgs[0].timestamp;
        const fragment = document.createDocumentFragment();
        let lastDateKey = null;

        for (let i = 0; i < olderMsgs.length; i++) {
          const currentMsg = olderMsgs[i];
          const dateKey = getDateKey(currentMsg.timestamp);

          if (dateKey !== lastDateKey) {
            fragment.appendChild(createDateSeparatorNode(currentMsg.timestamp));
            lastDateKey = dateKey;
          }

          fragment.appendChild(createMessageNode(currentMsg));
        }

        // If the top element in container is a date separator with the same dateKey,
        // remove it because it is already placed at the top of that date block in olderMsgs
        const firstExisting = elements.messagesContainer.firstElementChild;
        if (firstExisting && firstExisting.classList.contains('date-separator')) {
          const lastOlderDateKey = getDateKey(olderMsgs[olderMsgs.length - 1].timestamp);
          if (firstExisting.dataset.dateKey === lastOlderDateKey) {
            firstExisting.remove();
          }
        }

        elements.messagesContainer.insertBefore(fragment, elements.messagesContainer.firstChild);

        // Keep scroll position stable
        vp.scrollTop = vp.scrollHeight - prevScrollHeight;
      }

      elements.topLoadingLabel.textContent = hasOlderMessages ? 'Scroll up for older messages' : 'Beginning of chat history';
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      isLoadingOlder = false;
      elements.topSpinner.classList.add('hidden');
    }
  }

  /**
   * Send a new message
   */
  async function sendMessage() {
    const text = elements.messageInput.value.trim();
    if (!text || !activeConversationId) return;

    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';

    const msg = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      conversationId: activeConversationId,
      sender: 'me',
      text: text,
      timestamp: Date.now(),
      status: 'sent'
    };

    // 1. Instant DOM append
    appendMessageToDOM(msg);
    scrollToBottomIfNear(true);

    // 2. Save asynchronously to IndexedDB in micro-write
    await window.DB.saveMessage(msg);

    // 3. Send over active WebRTC DataChannel directly to remote peer
    if (window.P2P && window.P2P.isConnected()) {
      window.P2P.sendP2PMessage({
        type: 'CHAT_MESSAGE',
        message: {
          ...msg,
          sender: localUserId
        }
      });
    }

    // 4. Send over BroadcastChannel for same-device cross-tab testing
    if (broadcastChannel) {
      broadcastChannel.postMessage({
        type: 'NEW_MESSAGE',
        message: {
          ...msg,
          sender: localUserId
        }
      });
    }

    renderConversations();
  }

  const CHUNK_SIZE = 16384; // 16KB safe chunks for low-memory WebRTC DataChannels
  const activeIncomingTransfers = new Map(); // fileId -> { chunks, received, total, msg }

  /**
   * Resize and compress images (max 1280px, JPEG quality 0.7)
   */
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1280;
          let width = img.width;
          let height = img.height;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.7 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve({
            dataUrl,
            width,
            height
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Update transfer progress in DOM
   */
  function updateTransferProgress(fileId, pct, label) {
    const box = document.getElementById(`progress-${fileId}`);
    if (box) {
      const fill = box.querySelector('.progress-bar-fill');
      const text = box.querySelector('.progress-label');
      if (fill) fill.style.width = pct + '%';
      if (text) text.innerHTML = `<span>${label}</span><span>${pct}%</span>`;
    }
  }

  /**
   * Remove transfer progress in DOM
   */
  function removeTransferProgress(fileId) {
    const box = document.getElementById(`progress-${fileId}`);
    if (box) box.remove();
  }

  /**
   * Compress, display, and send image in chunks
   */
  async function handleImageUpload(file) {
    if (!file || !activeConversationId) return;

    try {
      // 1. Compress image
      const compressed = await compressImage(file);
      const fileId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

      const msg = {
        id: fileId,
        conversationId: activeConversationId,
        sender: 'me',
        text: '',
        image: compressed.dataUrl,
        timestamp: Date.now(),
        status: 'sent',
        isTransferring: true,
        progress: 0,
        transferLabel: 'Sending image 0%...'
      };

      // 2. Add message to DOM immediately
      appendMessageToDOM(msg);
      scrollToBottomIfNear(true);

      // 3. Split into 16KB chunks
      const dataString = compressed.dataUrl;
      const totalChunks = Math.ceil(dataString.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = dataString.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const packet = {
          type: 'IMAGE_CHUNK',
          fileId: fileId,
          conversationId: activeConversationId,
          chunkIndex: i,
          totalChunks: totalChunks,
          data: chunk,
          timestamp: msg.timestamp,
          sender: localUserId
        };

        if (window.P2P && window.P2P.isConnected()) {
          window.P2P.sendP2PMessage(packet);
        }
        if (broadcastChannel) {
          broadcastChannel.postMessage(packet);
        }

        const pct = Math.round(((i + 1) / totalChunks) * 100);
        updateTransferProgress(fileId, pct, `Sending ${pct}%...`);
        // Non-blocking sleep for smooth 60fps on budget Android devices
        await new Promise((r) => setTimeout(r, 10));
      }

      // Finish sending
      removeTransferProgress(fileId);
      msg.isTransferring = false;
      await window.DB.saveMessage(msg);
      renderConversations();
    } catch (err) {
      console.error('Image compression or sending failed:', err);
      alert('Could not process image: ' + err.message);
    }
  }

  /**
   * Handle incoming image chunks
   */
  async function handleIncomingChunk(packet) {
    const { fileId, conversationId, chunkIndex, totalChunks, data, timestamp, sender } = packet;

    if (!activeIncomingTransfers.has(fileId)) {
      const initialMsg = {
        id: fileId,
        conversationId: conversationId,
        sender: sender || 'peer',
        text: '',
        image: null,
        timestamp: timestamp || Date.now(),
        status: 'delivered',
        isTransferring: true,
        progress: 0,
        transferLabel: 'Receiving image 0%...'
      };

      activeIncomingTransfers.set(fileId, {
        chunks: new Array(totalChunks),
        received: 0,
        total: totalChunks,
        msg: initialMsg
      });

      if (conversationId === activeConversationId) {
        appendMessageToDOM(initialMsg);
      }
    }

    const transfer = activeIncomingTransfers.get(fileId);
    if (!transfer.chunks[chunkIndex]) {
      transfer.chunks[chunkIndex] = data;
      transfer.received++;

      const pct = Math.round((transfer.received / transfer.total) * 100);
      updateTransferProgress(fileId, pct, `Receiving ${pct}%...`);

      if (transfer.received === transfer.total) {
        // Complete!
        const fullDataUrl = transfer.chunks.join('');
        transfer.msg.image = fullDataUrl;
        transfer.msg.isTransferring = false;

        const row = document.getElementById(`msg-${fileId}`);
        if (row) {
          const bubble = row.querySelector('.message-bubble');
          if (bubble) {
            let imgWrap = bubble.querySelector('.message-image-wrapper');
            if (!imgWrap) {
              imgWrap = document.createElement('div');
              imgWrap.className = 'message-image-wrapper';
              bubble.insertBefore(imgWrap, bubble.firstChild);
            }
            imgWrap.innerHTML = `<img class="message-image" src="${fullDataUrl}" alt="Photo" />`;
          }
        }

        removeTransferProgress(fileId);
        await window.DB.saveMessage(transfer.msg);
        activeIncomingTransfers.delete(fileId);
        renderConversations();
      }
    }
  }

  /**
   * Render conversations list in sidebar
   */
  async function renderConversations() {
    const convs = await window.DB.getConversations();
    elements.conversationsList.innerHTML = '';

    convs.forEach((conv) => {
      const item = document.createElement('div');
      item.className = `conversation-item ${conv.id === activeConversationId ? 'active' : ''}`;
      item.onclick = () => selectConversation(conv);

      const avatar = document.createElement('div');
      avatar.className = 'conversation-avatar';
      avatar.textContent = (conv.name || 'P').charAt(0).toUpperCase();

      const content = document.createElement('div');
      content.className = 'conversation-content';

      const top = document.createElement('div');
      top.className = 'conversation-top';

      const name = document.createElement('span');
      name.className = 'conversation-name';
      name.textContent = conv.name || 'Peer Chat';

      const time = document.createElement('span');
      time.className = 'conversation-time';
      time.textContent = formatTime(conv.updatedAt);

      top.appendChild(name);
      top.appendChild(time);

      const bottom = document.createElement('div');
      bottom.className = 'conversation-bottom';

      const preview = document.createElement('span');
      preview.className = 'conversation-preview';
      preview.textContent = conv.lastMessage || 'No messages yet';

      bottom.appendChild(preview);
      content.appendChild(top);
      content.appendChild(bottom);

      item.appendChild(avatar);
      item.appendChild(content);
      elements.conversationsList.appendChild(item);
    });
  }

  /**
   * Select a conversation
   */
  function selectConversation(conv) {
    activeConversationId = conv.id;
    elements.activeAvatar.textContent = (conv.name || 'P').charAt(0).toUpperCase();
    elements.activeChatTitle.textContent = conv.name || 'Peer Chat';
    elements.activeChatSubtitle.textContent = window.P2P && window.P2P.isConnected() 
      ? '🟢 Direct P2P Connected' 
      : 'Direct P2P Ready • Stored locally';
    
    if (window.innerWidth <= 768) {
      elements.sidebar.classList.add('mobile-hidden');
    }

    renderConversations();
    loadConversationMessages(conv.id);
  }

  /**
   * P2P Modal Management & Tab switching
   */
  function switchModalTab(tabName) {
    elements.tabShowQr.classList.remove('active');
    elements.tabScanQr.classList.remove('active');
    elements.tabCode.classList.remove('active');
    elements.paneShowQr.classList.add('hidden');
    elements.paneScanQr.classList.add('hidden');
    elements.paneCode.classList.add('hidden');

    // Stop camera if leaving scan tab
    if (tabName !== 'scan') {
      window.P2P.stopQrScanner('scannerVideo');
    }

    if (tabName === 'show') {
      elements.tabShowQr.classList.add('active');
      elements.paneShowQr.classList.remove('hidden');
      generateAndDisplayOffer();
    } else if (tabName === 'scan') {
      elements.tabScanQr.classList.add('active');
      elements.paneScanQr.classList.remove('hidden');
      startCameraScanner();
    } else if (tabName === 'code') {
      elements.tabCode.classList.add('active');
      elements.paneCode.classList.remove('hidden');
    }
  }

  /**
   * Generate WebRTC Offer and render QR with real clickable URL
   */
  async function generateAndDisplayOffer() {
    try {
      elements.qrContainer.innerHTML = '<span class="loading-label">Generating direct invite link...</span>';
      currentOfferString = await window.P2P.createOffer();
      
      const directUrl = window.P2P.createConnectLink(currentOfferString);
      if (elements.directConnectUrlInput) {
        elements.directConnectUrlInput.value = directUrl;
      }
      elements.manualOfferText.value = directUrl;

      // Render QR code pointing to the real clickable link
      await window.P2P.renderQrCode('qrContainer', directUrl);
    } catch (e) {
      console.error('Failed to generate invite offer:', e);
      elements.qrContainer.innerHTML = '<span style="color:var(--danger)">Failed to generate link</span>';
    }
  }

  /**
   * Process scanned or uploaded token (handles URLs, base64, and raw JSON)
   */
  async function handleScannedToken(scannedText) {
    elements.scannerStatus.textContent = 'Code detected! Connecting...';
    try {
      const payload = window.P2P.decodeToken(scannedText);
      if (!payload) throw new Error('Could not parse connection data.');

      if (payload.type === 'offer') {
        elements.scannerStatus.textContent = 'Generating answer link...';
        const answer = await window.P2P.createAnswer(JSON.stringify(payload));
        const answerLink = window.P2P.createAnswerLink(answer);

        switchModalTab('show');
        if (elements.directConnectUrlInput) elements.directConnectUrlInput.value = answerLink;
        elements.manualOfferText.value = answerLink;
        elements.answerInput.value = answerLink;

        await window.P2P.renderQrCode('qrContainer', answerLink);
        alert('Invite accepted! Copy your Answer Link below to send back to your friend.');
      } else if (payload.type === 'answer') {
        await window.P2P.acceptAnswer(JSON.stringify(payload));
        elements.connectModal.classList.add('hidden');
        alert('Connected successfully! You can now chat peer-to-peer.');
      } else {
        alert('Unrecognized connection data.');
      }
    } catch (err) {
      alert('Could not connect: ' + err.message);
    }
  }

  /**
   * Start Camera QR Scanner with graceful permission denial fallback
   */
  function startCameraScanner() {
    if (elements.cameraFallbackCard) {
      elements.cameraFallbackCard.classList.add('hidden');
    }
    elements.scannerStatus.textContent = 'Requesting camera access...';

    window.P2P.startQrScanner('scannerVideo', (scannedText) => {
      handleScannedToken(scannedText);
    }, (err) => {
      console.warn('Camera scan error:', err);
      elements.scannerStatus.textContent = 'Camera permission denied or not available.';
      if (elements.cameraFallbackCard) {
        elements.cameraFallbackCard.classList.remove('hidden');
      }
    });
  }

  /**
   * Setup Listeners
   */
  function initListeners() {
    elements.messagesViewport.addEventListener('scroll', () => {
      const vp = elements.messagesViewport;
      if (vp.scrollTop < 60) loadOlderMessages();
      const dist = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      elements.scrollBottomBtn.classList.toggle('hidden', dist <= 300);
    }, { passive: true });

    elements.scrollBottomBtn.addEventListener('click', () => scrollToBottomIfNear(true));

    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    elements.messageInput.addEventListener('input', () => {
      elements.messageInput.style.height = 'auto';
      elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';
    });

    elements.composerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage();
    });

    elements.mobileBackBtn.addEventListener('click', () => {
      elements.sidebar.classList.remove('mobile-hidden');
    });

    // P2P Connect Modals
    const openConnectModal = () => {
      elements.connectModal.classList.remove('hidden');
      switchModalTab('show');
    };

    elements.newChatBtn.addEventListener('click', openConnectModal);
    elements.connectPeerBtn.addEventListener('click', openConnectModal);

    elements.closeModalBtn.addEventListener('click', () => {
      window.P2P.stopQrScanner('scannerVideo');
      elements.connectModal.classList.add('hidden');
    });

    elements.tabShowQr.addEventListener('click', () => switchModalTab('show'));
    elements.tabScanQr.addEventListener('click', () => switchModalTab('scan'));
    elements.tabCode.addEventListener('click', () => switchModalTab('code'));

    elements.copyOfferBtn.addEventListener('click', async () => {
      try {
        if (!currentOfferString) {
          currentOfferString = await window.P2P.createOffer();
          await window.P2P.renderQrCode('qrContainer', currentOfferString);
        }
        const link = window.P2P.createConnectLink(currentOfferString);
        if (elements.directConnectUrlInput) elements.directConnectUrlInput.value = link;
        await navigator.clipboard.writeText(link);
        elements.copyOfferSuccess.classList.remove('hidden');
        setTimeout(() => elements.copyOfferSuccess.classList.add('hidden'), 2500);
      } catch (e) {
        alert('Could not copy link: ' + e.message);
      }
    });

    if (elements.fallbackToCodeBtn) {
      elements.fallbackToCodeBtn.addEventListener('click', () => {
        switchModalTab('code');
      });
    }

    const onFileQrSelect = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      elements.scannerStatus.textContent = 'Scanning QR from uploaded file...';
      window.P2P.scanQrImage(file, (decoded) => {
        handleScannedToken(decoded);
      }, (err) => {
        elements.scannerStatus.textContent = 'Could not find a valid QR code in this image.';
        alert('Could not find a valid QR code in this image: ' + err.message);
      });
      e.target.value = '';
    };

    if (elements.qrFileInput) elements.qrFileInput.addEventListener('change', onFileQrSelect);
    if (elements.qrFileInputAlt) elements.qrFileInputAlt.addEventListener('change', onFileQrSelect);

    // Image Attachment Button
    if (elements.attachBtn && elements.imageInput) {
      elements.attachBtn.addEventListener('click', () => {
        elements.imageInput.click();
      });

      elements.imageInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          handleImageUpload(file);
        }
        e.target.value = '';
      });
    }

    // 1-Click Copy Connect Link
    if (elements.copyConnectLinkBtn) {
      elements.copyConnectLinkBtn.addEventListener('click', async () => {
        try {
          if (!currentOfferString) {
            elements.qrContainer.innerHTML = '<span class="loading-label">Generating direct link...</span>';
            currentOfferString = await window.P2P.createOffer();
            await window.P2P.renderQrCode('qrContainer', currentOfferString);
            elements.manualOfferText.value = currentOfferString;
          }
          const link = window.P2P.createConnectLink(currentOfferString);
          await navigator.clipboard.writeText(link);
          if (elements.linkCopiedToast) {
            elements.linkCopiedToast.textContent = 'Direct Connect Link copied! Send it to your friend.';
            elements.linkCopiedToast.classList.remove('hidden');
            setTimeout(() => elements.linkCopiedToast.classList.add('hidden'), 3500);
          }
        } catch (err) {
          alert('Could not copy link: ' + err.message);
        }
      });
    }

    // 1-Click Share Connect Link
    if (elements.shareConnectLinkBtn) {
      elements.shareConnectLinkBtn.addEventListener('click', async () => {
        try {
          if (!currentOfferString) {
            currentOfferString = await window.P2P.createOffer();
            await window.P2P.renderQrCode('qrContainer', currentOfferString);
            elements.manualOfferText.value = currentOfferString;
          }
          const link = window.P2P.createConnectLink(currentOfferString);
          if (navigator.share) {
            await navigator.share({
              title: 'FlashChat Direct P2P',
              text: 'Chat with me directly on FlashChat (No server, encrypted):',
              url: link
            });
          } else {
            await navigator.clipboard.writeText(link);
            alert('Link copied to clipboard! Send it to your friend via WhatsApp, SMS, or Telegram.');
          }
        } catch (e) {}
      });
    }

    // 1-Tap Paste from Clipboard & Connect
    if (elements.pasteFromClipboardBtn) {
      elements.pasteFromClipboardBtn.addEventListener('click', async () => {
        try {
          const clipText = await navigator.clipboard.readText();
          if (!clipText || !clipText.trim()) {
            alert('Clipboard is empty! Copy your friend\'s code or link first.');
            return;
          }

          let token = clipText.trim();
          if (token.includes('#connect=')) {
            token = token.split('#connect=')[1].split('&')[0];
          } else if (token.includes('#answer=')) {
            token = token.split('#answer=')[1].split('&')[0];
          }

          let payload;
          try {
            payload = window.P2P.decodeToken(token);
          } catch (e) {
            payload = JSON.parse(token);
          }

          if (payload.type === 'offer') {
            const answer = await window.P2P.createAnswer(JSON.stringify(payload));
            switchModalTab('show');
            await window.P2P.renderQrCode('qrContainer', answer);
            elements.manualOfferText.value = answer;
            elements.answerInput.value = answer;
            alert('Invite accepted! Copy your answer link or code below to send back to your friend.');
          } else if (payload.type === 'answer') {
            await window.P2P.acceptAnswer(JSON.stringify(payload));
            elements.connectModal.classList.add('hidden');
            alert('Connected successfully from clipboard!');
          }
        } catch (err) {
          alert('Could not connect from clipboard: ' + err.message);
        }
      });
    }

    const connectWithInput = async (inputVal) => {
      const val = (inputVal || '').trim();
      if (!val) return;
      try {
        const payload = window.P2P.decodeToken(val);
        if (!payload) throw new Error('Could not parse connection string');

        if (payload.type === 'offer') {
          // If given an offer, automatically generate and show the answer link
          const answer = await window.P2P.createAnswer(JSON.stringify(payload));
          const answerLink = window.P2P.createAnswerLink(answer);
          switchModalTab('show');
          if (elements.directConnectUrlInput) elements.directConnectUrlInput.value = answerLink;
          elements.manualOfferText.value = answerLink;
          elements.answerInput.value = answerLink;
          await window.P2P.renderQrCode('qrContainer', answerLink);
          navigator.clipboard.writeText(answerLink).catch(() => {});
          alert('Invite accepted! Copy your Answer Link to send back to your friend.');
        } else if (payload.type === 'answer') {
          // If given an answer, finalize P2P connection
          await window.P2P.acceptAnswer(JSON.stringify(payload));
          elements.connectModal.classList.add('hidden');
          elements.answerInput.value = '';
          elements.manualAnswerText.value = '';
          alert('Connected successfully! You can now chat peer-to-peer.');
        } else {
          alert('Unrecognized connection data.');
        }
      } catch (err) {
        alert('Could not connect: ' + err.message);
      }
    };

    elements.applyAnswerBtn.addEventListener('click', () => {
      connectWithInput(elements.answerInput.value);
    });

    elements.manualConnectBtn.addEventListener('click', () => {
      connectWithInput(elements.manualAnswerText.value);
    });

    // P2P Callbacks
    window.P2P.onStatus((status) => {
      console.log('P2P Status:', status);
      const isOnline = status === 'connected';
      elements.headerStatusDot.classList.toggle('connected', isOnline);
      elements.headerStatusText.textContent = isOnline ? '🟢 Connected P2P' : 'Connect P2P';
      elements.activeChatSubtitle.textContent = isOnline 
        ? '🟢 Direct P2P Connected' 
        : 'Direct P2P Ready • Stored locally';

      // Mark unread messages as read when connecting
      if (isOnline) markCurrentConversationAsRead();
    });

    window.P2P.onMessage(async (data) => {
      if (data.type === 'CHAT_MESSAGE') {
        const incoming = data.message;
        await window.DB.saveMessage(incoming);
        if (incoming.conversationId === activeConversationId) {
          appendMessageToDOM(incoming);
        }
        renderConversations();

        // Send Delivery ACK immediately
        const deliveryAck = { type: 'DELIVERY_ACK', messageId: incoming.id };
        if (window.P2P && window.P2P.isConnected()) window.P2P.sendP2PMessage(deliveryAck);
        if (broadcastChannel) broadcastChannel.postMessage(deliveryAck);

        // If window is active and chat is visible, send Read ACK
        if (!document.hidden && incoming.conversationId === activeConversationId) {
          const readAck = { type: 'READ_ACK', messageId: incoming.id };
          if (window.P2P && window.P2P.isConnected()) window.P2P.sendP2PMessage(readAck);
          if (broadcastChannel) broadcastChannel.postMessage(readAck);
        }
      } else if (data.type === 'IMAGE_CHUNK') {
        handleIncomingChunk(data);
      } else if (data.type === 'DELIVERY_ACK') {
        updateMessageTick(data.messageId, 'delivered');
      } else if (data.type === 'READ_ACK') {
        updateMessageTick(data.messageId, 'read');
      }
    });

    // BroadcastChannel for cross-tab local testing
    if (broadcastChannel) {
      broadcastChannel.onmessage = async (event) => {
        const data = event.data;
        if (data.type === 'NEW_MESSAGE') {
          const incoming = data.message;
          await window.DB.saveMessage(incoming);
          if (incoming.conversationId === activeConversationId) {
            appendMessageToDOM(incoming);
          }
          renderConversations();

          // Return delivery ACK
          const ack = { type: 'DELIVERY_ACK', messageId: incoming.id };
          broadcastChannel.postMessage(ack);

          if (!document.hidden && incoming.conversationId === activeConversationId) {
            broadcastChannel.postMessage({ type: 'READ_ACK', messageId: incoming.id });
          }
        } else if (data.type === 'IMAGE_CHUNK') {
          handleIncomingChunk(data);
        } else if (data.type === 'DELIVERY_ACK') {
          updateMessageTick(data.messageId, 'delivered');
        } else if (data.type === 'READ_ACK') {
          updateMessageTick(data.messageId, 'read');
        }
      };
    }

    // Send Read ACK when user focuses window
    window.addEventListener('focus', markCurrentConversationAsRead);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) markCurrentConversationAsRead();
    });
  }

  /**
   * Send Read receipts for all received messages in active conversation
   */
  function markCurrentConversationAsRead() {
    if (document.hidden || !activeConversationId) return;
    const receivedRows = elements.messagesContainer.querySelectorAll('.message-row.received');
    receivedRows.forEach((row) => {
      const msgId = row.id.replace('msg-', '');
      const packet = { type: 'READ_ACK', messageId: msgId };
      if (window.P2P && window.P2P.isConnected()) window.P2P.sendP2PMessage(packet);
      if (broadcastChannel) broadcastChannel.postMessage(packet);
    });
  }

  /**
   * Check URL hash on page load for 1-click connect links (#connect=... or #answer=...)
   */
  async function checkUrlConnectHash() {
    const hash = window.location.hash;
    if (!hash) return;

    if (hash.startsWith('#connect=')) {
      const token = hash.replace('#connect=', '');
      window.location.hash = ''; // clear hash
      try {
        const offerPayload = window.P2P.decodeToken(token);
        elements.connectModal.classList.remove('hidden');
        switchModalTab('show');
        elements.qrContainer.innerHTML = '<span class="loading-label">Connecting via shared link...</span>';
        
        const answer = await window.P2P.createAnswer(JSON.stringify(offerPayload));
        const answerLink = window.P2P.createAnswerLink(answer);
        if (elements.directConnectUrlInput) elements.directConnectUrlInput.value = answerLink;
        elements.manualOfferText.value = answerLink;
        elements.answerInput.value = answerLink;
        await window.P2P.renderQrCode('qrContainer', answerLink);
        navigator.clipboard.writeText(answerLink).catch(() => {});
        alert('Connected to friend\'s invite! Send your Answer Link back to complete pairing.');
      } catch (err) {
        console.error('Failed to auto-connect from URL:', err);
      }
    } else if (hash.startsWith('#answer=')) {
      const token = hash.replace('#answer=', '');
      window.location.hash = '';
      try {
        const answerPayload = window.P2P.decodeToken(token);
        await window.P2P.acceptAnswer(JSON.stringify(answerPayload));
        elements.connectModal.classList.add('hidden');
        alert('Connected successfully from answer link!');
      } catch (err) {
        console.error('Failed to accept answer from URL:', err);
      }
    }
  }

  // Register Service Worker for offline instant loading
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        console.log('ServiceWorker registered:', reg.scope);
      }).catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    });
  }

  /**
   * Boot
   */
  async function init() {
    initListeners();
    await checkUrlConnectHash();
    window.addEventListener('hashchange', checkUrlConnectHash);
    await window.DB.seedInitialDataIfEmpty();
    const convs = await window.DB.getConversations();
    if (convs.length > 0) {
      selectConversation(convs[0]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();