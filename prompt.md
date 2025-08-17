## Project Goal

The goal was to build a Chrome extension that captures all HTTP requests on a webpage, automatically filtering and saving only the JSON responses to a local database. The extension organizes logs by page-loading sessions, clears them automatically on new page loads, and provides an interface to view, search, and ask an AI (Google Gemini 2.5 Flash) questions about the captured data for the current session.

## 1. Configuration (manifest.json)

This is the extension's blueprint. It defines all the necessary components and permissions.
Permissions: Grants access to browser features like `storage` (for the API key and enabled domains), `scripting`, and `activeTab`.
Host Permissions: Allows the extension to intercept requests on `<all_urls>`.
Service Worker: Registers `background.js` as the service worker for database management and API calls.
Content Scripts: Injects `content.js` into all webpages at `document_start` to initiate the interception process.
Web Accessible Resources: Makes `interceptor.js` available to be injected directly into the webpage's environment.
Action: Defines `popup.html` as the main user interface that appears when the extension icon is clicked.

## 2. Interception (content.js & interceptor.js)

This two-part system is responsible for capturing network traffic.
`content.js` (The Injector and Messenger):
Runs immediately when a page starts loading.
Generates a unique `pageLoadId` for the current browsing session.
Injects `interceptor.js` directly into the webpage's environment.
Communicates with `interceptor.js` to send activation state (enabled/disabled for the current domain).
Listens for `INTERCEPTED_REQUEST` messages from `interceptor.js`, adds the `pageLoadId`, and forwards the data to `background.js`.
Informs `background.js` about new page loads.
Responds to messages from the popup to provide the current `pageLoadId` and set the interception activation state for the current site.

`interceptor.js` (The Catcher):
Injected directly into the webpage's environment.
"Monkey-patches" the browser's native `fetch` and `XMLHttpRequest` functions to intercept network requests and their responses.
Captures the request URL, method, response body, and `Content-Type` header.
Sends this complete data package as an `INTERCEPTED_REQUEST` message to `content.js` if interception is active for the current domain.
Listens for `GEMINI_INTERCEPTOR_STATE` messages from `content.js` to toggle its active state.

## 3. Background Logic (background.js)

This script is the extension's central hub, handling all data processing, storage, and AI communication.
Database Management: Initializes and manages an IndexedDB database (`ApiDetectorDB`, `requests` store) to store captured logs, with indexes for `pageLoadId`, `url`, and `timestamp`.
Automatic Clearing: Listens for `NEW_PAGE_LOAD` messages from `content.js` and automatically clears all data from the IndexedDB for each new page load.
JSON Filtering: Receives captured network data from `content.js` and checks the `Content-Type` header. Only responses marked as `application/json` are saved to the database.
Log Retrieval: Responds to `GET_LOGS` messages from the popup, retrieving logs specific to a `pageLoadId`.
Log Deletion: Handles `DELETE_LOG` messages to remove individual logs and `CLEAR_ALL_LOGS` to clear all stored data.
Gemini API Integration: Listens for `ASK_GEMINI` messages from the popup. It retrieves the saved API key from `chrome.storage.sync`, constructs a prompt containing the relevant logs and the user's question, calls the Google Gemini 2.5 Flash API, and returns the answer. Includes basic API key validation.

## 4. User Interface (popup.html & popup.js)

This is the visual front-end where the user interacts with the captured data.
`popup.html`: Defines the structure of the extension's popup, including sections for displaying logs, a search bar, an AI query interface, and a settings view. It uses Font Awesome for icons.
`popup.js`:
Initializes the popup by getting the current `pageLoadId` and loading logs.
Displays logs specific to the current session, sorted by timestamp, and allows for client-side filtering via a search bar.
Provides functionality to copy log content to the clipboard and delete individual logs.
Manages the "Ask Gemini" feature: sends user questions and current session logs to `background.js` for AI analysis and displays the AI's response.
Includes a site-specific toggle to enable/disable interception for the current domain, saving the preference in `chrome.storage.local`.
Manages the integrated settings view: allows users to enter, save, clear, and toggle visibility of their Google Gemini API key, which is securely stored using `chrome.storage.sync`. Provides visual feedback for settings actions.
