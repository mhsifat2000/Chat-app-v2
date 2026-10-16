/**
 * FlashChat - IndexedDB Storage Engine (db.js)
 * High-performance, non-blocking local storage layer.
 * Zero external dependencies.
 */

const DB_NAME = 'FlashChatDB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Open and initialize the IndexedDB instance
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        msgStore.createIndex('conv_time', ['conversationId', 'timestamp'], { unique: false });
      }

      // Conversations store
      if (!db.objectStoreNames.contains('conversations')) {
        const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
        convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Save a single message asynchronously (small non-blocking write)
 */
async function saveMessage(message) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['messages', 'conversations'], 'readwrite');
    const msgStore = tx.objectStore('messages');
    const convStore = tx.objectStore('conversations');

    msgStore.put(message);

    // Update conversation preview and timestamp
    const convReq = convStore.get(message.conversationId);
    convReq.onsuccess = () => {
      const conv = convReq.result || {
        id: message.conversationId,
        name: 'Peer ' + message.conversationId.slice(0, 5),
        createdAt: message.timestamp
      };
      conv.lastMessage = message.text || (message.attachment ? '[Attachment]' : '');
      conv.updatedAt = message.timestamp;
      convStore.put(conv);
    };

    tx.oncomplete = () => resolve(message);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load the latest 50 messages for a conversation
 * Uses reverse cursor ('prev') to efficiently get the newest 50 without loading all history.
 */
async function getLatestMessages(conversationId, limit = 50) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('conv_time');

    // Bound range from [conversationId, 0] to [conversationId, Infinity]
    const range = IDBKeyRange.bound([conversationId, 0], [conversationId, Infinity]);
    const messages = [];

    // Direction 'prev' fetches newest first
    const request = index.openCursor(range, 'prev');

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && messages.length < limit) {
        messages.push(cursor.value);
        cursor.continue();
      } else {
        // Return in ascending chronological order [oldest ... newest]
        messages.reverse();
        const hasMore = Boolean(cursor);
        resolve({ messages, hasMore });
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Load up to 50 older messages before a specific timestamp for scroll-up pagination
 */
async function getOlderMessages(conversationId, beforeTimestamp, limit = 50) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('conv_time');

    // Bound range before given timestamp
    const range = IDBKeyRange.bound(
      [conversationId, 0], 
      [conversationId, beforeTimestamp - 0.001]
    );
    const messages = [];

    const request = index.openCursor(range, 'prev');

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && messages.length < limit) {
        messages.push(cursor.value);
        cursor.continue();
      } else {
        messages.reverse();
        const hasMore = Boolean(cursor);
        resolve({ messages, hasMore });
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all conversations sorted by updatedAt descending
 */
async function getConversations() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('conversations', 'readonly');
    const store = tx.objectStore('conversations');
    const index = store.index('updatedAt');
    const conversations = [];

    const request = index.openCursor(null, 'prev');
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        conversations.push(cursor.value);
        cursor.continue();
      } else {
        resolve(conversations);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save or update a conversation
 */
async function saveConversation(conv) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('conversations', 'readwrite');
    const store = tx.objectStore('conversations');
    store.put(conv);
    tx.oncomplete = () => resolve(conv);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Seed initial sample conversation with 70 messages
 * so the user can immediately test scrolling up to paginate the oldest 50 messages!
 */
async function seedInitialDataIfEmpty() {
  const convs = await getConversations();
  if (convs.length > 0) return convs[0].id;

  const demoConvId = 'demo-p2p-chat';
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const twoDaysAgo = now - 2 * oneDay;
  const yesterday = now - 1 * oneDay;

  const initialConv = {
    id: demoConvId,
    name: 'P2P Test Room (Tab Sync)',
    updatedAt: now,
    createdAt: twoDaysAgo,
    lastMessage: 'Type below to test live append!'
  };

  await saveConversation(initialConv);

  const db = await openDB();
  const tx = db.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');

  // Insert 65 sample messages spanning across 2 days ago, yesterday, and today
  for (let i = 1; i <= 65; i++) {
    let msgTime;
    if (i <= 20) {
      msgTime = twoDaysAgo + i * 3 * 60 * 1000;
    } else if (i <= 45) {
      msgTime = yesterday + (i - 20) * 3 * 60 * 1000;
    } else {
      msgTime = now - (66 - i) * 2 * 60 * 1000;
    }

    const isSent = i % 2 === 0;
    let status = 'read';
    if (i === 65) status = 'delivered';
    if (i === 64) status = 'sent';

    store.put({
      id: 'seed-msg-' + i,
      conversationId: demoConvId,
      sender: isSent ? 'me' : 'peer',
      text: i === 65 
        ? 'Welcome! This is message #65 (Today). Notice the real-time double ticks next to each message!' 
        : `Message #${i}: Fast zero-lag delivery test.`,
      timestamp: msgTime,
      status: status
    });
  }

  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(demoConvId);
  });
}

/**
 * Update message status ('sent', 'delivered', 'read')
 */
async function updateMessageStatus(id, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const req = store.get(id);
    req.onsuccess = () => {
      const msg = req.result;
      if (msg) {
        msg.status = status;
        store.put(msg);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Export for app.js
window.DB = {
  openDB,
  saveMessage,
  updateMessageStatus,
  getLatestMessages,
  getOlderMessages,
  getConversations,
  saveConversation,
  seedInitialDataIfEmpty
};
