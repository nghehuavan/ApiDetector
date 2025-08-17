
## Project Goal

The goal was to build a Chrome extension that captures all HTTP requests on a webpage, automatically filtering and saving only the JSON responses to a local database. The extension organizes logs by page-loading sessions, clears them automatically on new page loads, and provides an interface to view, search, and ask an AI (Google Gemini) questions about the captured data for the current session.

## 1. Configuration (manifest.json)

This is the extension's blueprint. It defines all the necessary components and permissions.
Permissions: Grants access to browser features like storage (for the API key), scripting, and the activeTab.
Scripts: Registers the core scripts:
background.js: The service worker for database management and API calls.
content.js: The script injected into webpages to start the interception process.
popup.html: The file for the main user interface.
Options Page: Adds a settings.html page, allowing users to configure the extension.
Web Access: Makes the interceptor.js file available to be injected into any webpage.

## 2. Interception (content.js & interceptor.js)

This two-part system is responsible for capturing network traffic.
content.js (The Injector):
Runs immediately when a page starts loading.
Creates a unique pageLoadId for the current browsing session.
Injects interceptor.js directly into the webpage's environment.
interceptor.js (The Catcher):
"Monkey-patches" the browser's native fetch and XMLHttpRequest functions.
It captures the request data, the response body, and the Content-Type header from the response.
It then passes this complete data package to content.js to be forwarded.

## 3. Background Logic (background.js)

This script is the extension's central hub, handling all data processing, storage, and AI communication.
Database Management: It creates, manages, and upgrades an IndexedDB database to store the logs.
Automatic Clearing: It listens for tab updates. When a new page starts loading, it automatically wipes all data from the IndexedDB.
JSON Filtering: It receives captured network data and checks the Content-Type header. Only responses marked as application/json are saved.
Gemini API Integration: It listens for askGemini messages from the popup. It retrieves the saved API key, constructs a prompt containing the relevant logs and the user's question, calls the Gemini API, and returns the answer.

## 4. User Interface (popup.html & popup.js)�

This is the visual front-end where the user interacts with the captured data.
Session-Specific Data: When opened, the popup gets the unique pageLoadId from the current page.
Log Display: It requests and displays only the logs that match the current session ID.
Interactive Search: A search bar allows for instant, client-side filtering of the displayed logs.
AI Query Interface: An input field and an "Ask Gemini" button allow the user to send the current session's logs and a question to the background script for analysis. The AI's response is then displayed directly in the popup.

## 5. Settings (settings.html & settings.js)

This provides a dedicated page for configuration.
API Key Management: It offers a simple interface with a password-protected input field for the user to enter and save their Gemini API key.
Secure Storage: The key is saved using chrome.storage.sync, which securely stores it and syncs it across the user's devices.
