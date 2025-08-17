// background.js - Service worker for database management and API calls

// Database configuration
const DB_NAME = 'GeminiInterceptorDB';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

// Initialize the database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create an object store for the intercepted requests
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });

        // Create indexes for faster querying
        store.createIndex('pageLoadId', 'pageLoadId', { unique: false });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// Save a request to the database
async function saveRequest(requestData) {
  try {
    const db = await initDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.add(requestData);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error saving request:', error);
    throw error;
  }
}

// Get all requests for a specific page load session
async function getRequestsByPageLoadId(pageLoadId) {
  try {
    const db = await initDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('pageLoadId');

      console.log('Getting requests for pageLoadId:', pageLoadId);
      const request = index.getAll(pageLoadId);

      request.onsuccess = () => {
        console.log('Found', request.result.length, 'requests for pageLoadId:', pageLoadId);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('Error getting requests for pageLoadId:', pageLoadId, request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error getting requests:', error);
    throw error;
  }
}

// Clear all requests from the database
async function clearAllRequests() {
  try {
    const db = await initDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.clear();

      request.onsuccess = () => {
        console.log('IndexedDB store.clear() successful.');
        resolve();
      };
      request.onerror = () => {
        console.error('IndexedDB store.clear() failed:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error clearing requests:', error);
    throw error;
  }
}

// Function to call the Google Gemini API
async function callGeminiAPI(apiKey, logs, question) {
  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  // Format logs for the prompt
  const formattedLogs = logs.map((log) => ({
    url: log.url,
    method: log.method,
    responseBody: log.responseBody,
    timestamp: new Date(log.timestamp).toISOString(),
  }));

  const prompt = `You are an AI assistant specialized in analyzing API responses.
Here are the JSON responses captured from a webpage during a single session:

${JSON.stringify(formattedLogs, null, 2)}

User's question: ${question}

Based on the provided JSON responses, please answer the user's question. If the information is not available in the logs, state that.`;

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error response:', errorData);
      throw new Error(`Gemini API error: ${errorData.error.message || response.statusText}`);
    }

    const data = await response.json();
    // Extract the text from the response
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer found.';
    return answer;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw new Error(`Failed to communicate with Gemini API: ${error.message}`);
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message.type, message);
  // Handle clear all logs request
  if (message.type === 'CLEAR_ALL_LOGS') {
    console.log('Received CLEAR_ALL_LOGS message.');
    clearAllRequests()
      .then(() => {
        console.log('All logs cleared successfully');
        sendResponse({ status: 'ok' });
      })
      .catch((error) => {
        console.error('Error clearing all logs:', error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  // Handle new page loads
  if (message.type === 'NEW_PAGE_LOAD') {
    console.log('Received NEW_PAGE_LOAD message. Clearing all requests.');
    // Clear the database when a new page starts loading
    clearAllRequests()
      .then(() => {
        console.log('Database cleared for new page load');
      })
      .catch((error) => {
        console.error('Error clearing database for new page load:', error);
      });
    return true;
  }

  // Handle intercepted requests
  if (message.type === 'INTERCEPTED_REQUEST') {
    // Check if the response is JSON
    if (message.contentType && message.contentType.includes('application/json')) {
      // Save the request to the database
      saveRequest({
        url: message.url,
        method: message.method,
        responseBody: message.responseBody,
        contentType: message.contentType,
        timestamp: message.timestamp,
        pageLoadId: message.pageLoadId,
      })
        .then(() => {
          console.log('Request saved to database');
        })
        .catch((error) => {
          console.error('Error saving request:', error);
        });
    }
    return true;
  }

  // Handle requests for logs from the popup
  if (message.type === 'GET_LOGS') {
    getRequestsByPageLoadId(message.pageLoadId)
      .then((logs) => {
        sendResponse({ logs });
      })
      .catch((error) => {
        console.error('Error getting logs:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep the message channel open for async response
  }

  // Handle Gemini API requests from the popup
  if (message.type === 'ASK_GEMINI') {
    // Get the API key from storage
    chrome.storage.sync.get(['geminiApiKey'], async (result) => {
      try {
        if (!result.geminiApiKey) {
          sendResponse({ error: 'API key not found. Please set it in the extension settings.' });
          return;
        }

        // Validate API key format (basic check)
        if (!result.geminiApiKey.startsWith('AI') || result.geminiApiKey.length < 10) {
          sendResponse({ error: 'Invalid API key format. Please check your API key in the settings.' });
          return;
        }

        // Get the logs for the current page load
        const logs = await getRequestsByPageLoadId(message.pageLoadId);

        // Call the Gemini API
        const answer = await callGeminiAPI(result.geminiApiKey, logs, message.question);

        // Send the answer back to the popup
        sendResponse({ answer });
      } catch (error) {
        console.error('Error processing Gemini request:', error);
        sendResponse({ error: error.message });
      }
    });
    return true; // Keep the message channel open for async response
  }
});

// Initialize the database when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  initDatabase()
    .then(() => {
      console.log('Database initialized');
    })
    .catch((error) => {
      console.error('Error initializing database:', error);
    });
});
