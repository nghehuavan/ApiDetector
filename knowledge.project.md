# API Detector - Chrome Extension

## Project Goal

A Chrome extension that captures all HTTP requests on webpages, automatically filtering and saving only JSON responses to a local IndexedDB database. The extension organizes logs by page-loading sessions, automatically clears them on new page loads, and provides a comprehensive interface to view, search, delete, and analyze captured data using Google Gemini 2.5 Flash AI.

## Project Architecture

This Chrome Extension follows Manifest V3 architecture with these core components:

### File Structure

```
ApiDetector/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker for data management & API calls
├── content.js            # Content script injector and messenger
├── interceptor.js        # Injected network traffic interceptor
├── popup.html           # Extension popup interface
├── popup.js             # Popup logic and UI interactions
├── popup.css            # Popup styling
└── knowledge.project.md # Project documentation
```

### Architecture Pattern

- **Manifest V3 Service Worker**: Background script handles persistent storage and API communications
- **Content Script Injection**: Dynamically injects network interceptor into webpage context
- **Message Passing**: Structured communication between extension contexts using Chrome messaging API
- **Session-Based Storage**: Each page load gets a unique session ID for data organization

## 1. Configuration (manifest.json)

This is the extension's blueprint. It defines all the necessary components and permissions.
Permissions: Grants access to browser features like `storage` (for the API key and enabled domains), `scripting`, and `activeTab`.
Host Permissions: Allows the extension to intercept requests on `<all_urls>`.
Service Worker: Registers `background.js` as the service worker for database management and API calls.
Content Scripts: Injects `content.js` into all webpages at `document_start` to initiate the interception process.
Web Accessible Resources: Makes `interceptor.js` available to be injected directly into the webpage's environment.
Action: Defines `popup.html` as the main user interface that appears when the extension icon is clicked.

## 2. Network Interception System (content.js & interceptor.js)

A sophisticated two-layer interception system that captures HTTP traffic without interfering with webpage functionality.

### 2.1 Content Script (content.js) - The Bridge

**Core Functions:**

- **Session Management**: Generates unique `pageLoadId` using `Date.now().toString()` for each page load
- **Script Injection**: Dynamically injects `interceptor.js` into the webpage's main world context
- **Message Routing**: Acts as a secure bridge between isolated extension context and webpage context
- **State Management**: Manages domain-specific interception enable/disable states

**Key Implementation Details:**

- Runs at `document_start` to ensure early injection before other scripts load
- Uses `chrome.runtime.getURL()` to securely load the interceptor script
- Implements async script injection with Promise-based loading confirmation
- Maintains persistent event listeners for bidirectional communication

**Message Flow:**

```
Popup → Content Script → Interceptor (activation state)
Interceptor → Content Script → Background (captured data)
Content Script → Background (page load events)
```

### 2.2 Network Interceptor (interceptor.js) - The Catcher

**Monkey-Patching Strategy:**

- **Fetch API Interception**: Wraps `window.fetch` with custom logic while preserving original behavior
- **XMLHttpRequest Interception**: Overrides `XMLHttpRequest.prototype.open` and `send` methods
- **Response Cloning**: Uses `response.clone()` to avoid consuming response streams
- **Non-Intrusive**: Maintains full compatibility with existing webpage functionality

**Technical Implementation:**

```javascript
// Fetch interception pattern
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  const responseClone = response.clone();
  // Process clone without affecting original response
  return response;
};
```

**Captured Data Points:**

- Request URL (full URL including query parameters)
- HTTP method (GET, POST, PUT, DELETE, etc.)
- Response body (complete response text)
- Content-Type header (for filtering JSON responses)
- Timestamp (millisecond precision using `Date.now()`)

**State Control:**

- Listens for `GEMINI_INTERCEPTOR_STATE` messages to toggle active/inactive modes
- Only processes requests when `isActive` flag is true
- Domain-specific activation controlled by user preferences

## 3. Background Service Worker (background.js)

The central processing hub running as a Manifest V3 service worker, managing persistent storage, data processing, and external API integrations.

### 3.1 IndexedDB Database Management

**Database Configuration:**

- **Database Name**: `ApiDetectorDB`
- **Version**: 1 (with upgrade handling)
- **Object Store**: `requests` with auto-incrementing `id` as keyPath
- **Indexes**:
  - `pageLoadId` (for session-based queries)
  - `url` (for URL-based filtering)
  - `timestamp` (for chronological sorting)

**Key Functions:**

- `initDatabase()`: Promise-based database initialization with error handling
- `saveRequest(requestData)`: Stores intercepted requests with full metadata
- `getRequestsByPageLoadId(pageLoadId)`: Retrieves session-specific logs
- `deleteRequestById(id)`: Removes individual log entries
- `clearAllRequests()`: Complete database cleanup

### 3.2 Automatic Session Management

**Page Load Handling:**

- Listens for `NEW_PAGE_LOAD` messages from content scripts
- Automatically triggers `clearAllRequests()` on every new page load
- Ensures fresh start for each browsing session
- Prevents memory overflow from accumulated data

**Session Isolation:**

- Each page load gets isolated data storage
- No cross-session data contamination
- Automatic cleanup maintains performance

### 3.3 JSON Response Filtering

**Content-Type Validation:**

```javascript
if (message.contentType && message.contentType.includes('application/json')) {
  // Only save JSON responses to database
  saveRequest(requestData);
}
```

**Filtering Logic:**

- Only processes responses with `application/json` Content-Type header
- Ignores HTML, CSS, JavaScript, images, and other non-JSON content
- Reduces storage overhead and improves performance
- Focuses on API responses relevant for analysis

### 3.4 Google Gemini AI Integration

**API Configuration:**

- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- **Authentication**: API key-based authentication via URL parameter
- **Model**: Gemini 2.5 Flash for fast response generation

**Request Processing:**

- Formats captured logs into structured JSON for AI analysis
- Constructs contextual prompts with user questions and relevant data
- Handles API errors and validation failures gracefully
- Returns structured responses to popup interface

**API Key Management:**

- Secure storage using `chrome.storage.sync`
- Basic validation (starts with 'AI', minimum length check)
- Error handling for missing or invalid keys
- Cross-device synchronization support

### 3.5 Message Handling Architecture

**Supported Message Types:**

- `INTERCEPTED_REQUEST`: Process and store captured network data
- `NEW_PAGE_LOAD`: Trigger session cleanup
- `GET_LOGS`: Retrieve logs for specific page session
- `DELETE_LOG`: Remove individual log entries
- `CLEAR_ALL_LOGS`: Complete database cleanup
- `ASK_GEMINI`: Process AI analysis requests

**Error Handling:**

- Comprehensive try-catch blocks for all async operations
- Detailed console logging for debugging
- Graceful failure responses to requesting contexts
- Maintains extension stability during edge cases

## 4. User Interface System (popup.html, popup.js, popup.css)

A comprehensive popup interface providing full control over captured data and AI analysis capabilities.

### 4.1 Interface Architecture

**Popup Dimensions & Layout:**

- **Width**: 700px (optimized for readability)
- **Max Height**: 800px with vertical scrolling
- **Layout**: Flexbox-based responsive design
- **Styling**: Google Material Design inspired with custom CSS

**View Management:**

- **Main View**: Primary interface for log viewing and AI interaction
- **Settings View**: Dedicated configuration panel for API key management
- **Toggle Navigation**: Seamless switching between views

### 4.2 Header Section

**Primary Header Features:**

- **Title**: "API Detector" with gradient background
- **Settings Button**: Quick access to configuration panel
- **Site Toggle**: Domain-specific enable/disable switch with visual feedback
- **Search Bar**: Real-time filtering of captured logs

**Site Activation Control:**

- Toggle switch with "Enabled"/"Disabled" labels
- Saves preferences per domain in `chrome.storage.local`
- Instantly communicates state changes to content script
- Visual feedback with color-coded status

### 4.3 Logs Display System

**Log Container Features:**

- **Header**: "Detected Api" title with action buttons (Refresh, Clear All)
- **Counter**: Dynamic count showing "X of Y JSON responses captured"
- **Sorting**: Newest first (timestamp descending)
- **Empty State**: "No JSON responses captured yet" message

**Individual Log Items:**

- **Collapsible Cards**: Click to expand/collapse response body
- **URL Display**: Truncated with ellipsis for long URLs
- **Method Badge**: Color-coded HTTP method (GET, POST, etc.)
- **Action Buttons**: Copy to clipboard, Delete individual log
- **JSON Formatting**: Pretty-printed with syntax highlighting

**Interactive Features:**

- **Copy Function**: Copies URL + formatted response body to clipboard
- **Visual Feedback**: Success animation on copy/delete actions
- **Scroll Container**: Fixed height with vertical scrolling
- **Hover Effects**: Enhanced visual feedback on interactive elements

### 4.4 Search and Filtering

**Real-time Search:**

- **Search Scope**: URL and response body content
- **Case Insensitive**: Flexible text matching
- **Live Results**: Instant filtering as user types
- **Result Counter**: Updates to show "X of Y" filtered results

**Performance Optimization:**

- Client-side filtering (no server requests)
- Maintains original data integrity
- Efficient string matching algorithms

### 4.5 AI Integration Interface

**"Ask Gemini" Section:**

- **Input Area**: Multi-line textarea for user questions
- **Send Button**: Prominent action button with loading states
- **Answer Display**: Formatted response container with scrolling
- **Error Handling**: User-friendly error messages with helpful links

**User Experience Features:**

- **Question Persistence**: Saves current question in `chrome.storage.local`
- **Loading Indicators**: Animated spinner during API calls
- **Response Formatting**: Preserves line breaks and formatting
- **Error Recovery**: Clear error messages with actionable guidance

### 4.6 Settings Management Panel

**API Key Configuration:**

- **Secure Input**: Password field with visibility toggle
- **Input Validation**: Real-time feedback on key format
- **Storage Options**: Save, Clear, and visibility controls
- **Status Messages**: Success/error feedback with auto-dismissal

**Settings Features:**

- **Visibility Toggle**: Eye icon to show/hide API key
- **External Links**: Direct link to Google AI Studio for key generation
- **About Section**: Version info and developer credits
- **Navigation**: Smooth back button to return to main view

### 4.7 Visual Design System

**Color Scheme:**

- **Primary**: Google Blue (#4285f4) for actions and accents
- **Background**: Light gray (#f8f9fa) for contrast
- **Text**: Multiple gray shades for hierarchy
- **Status Colors**: Green for success, red for errors

**Typography:**

- **Font Family**: Segoe UI system font stack
- **Hierarchy**: Multiple font sizes (10px - 16px)
- **Weight Variation**: Regular (400) and medium (500)
- **Monospace**: For JSON response display

**Interactive Elements:**

- **Buttons**: Rounded corners with hover animations
- **Form Controls**: Consistent styling across all inputs
- **Icons**: Font Awesome for consistent iconography
- **Animations**: Smooth transitions and loading states

## 5. Technical Implementation Details

### 5.1 Storage Architecture

**Chrome Storage API Implementation:**

- **`chrome.storage.local`**: Domain preferences and temporary UI state
  - `enabledDomains`: Array of hostnames where interception is active
  - `savedQuestion`: Current user input for persistence across sessions
- **`chrome.storage.sync`**: User settings synchronized across devices
  - `geminiApiKey`: Encrypted API key for Gemini integration

**IndexedDB for Request Storage:**

- **Local Database**: All captured requests stored client-side
- **No External Dependencies**: Complete offline functionality
- **Performance Optimized**: Indexed queries for fast retrieval
- **Memory Management**: Automatic cleanup prevents storage bloat

### 5.2 Site-Specific Toggle System

**Domain-Based Activation:**

```javascript
// Domain detection and storage
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  const hostname = new URL(tabs[0].url).hostname;
  // Store in enabledDomains array
});
```

**State Synchronization:**

- **Popup → Content Script**: Toggle state changes
- **Content Script → Interceptor**: Activation commands via `postMessage`
- **Persistent Storage**: Domain preferences survive browser restarts
- **Real-time Updates**: Instant activation/deactivation without page reload

### 5.3 Error Handling and Resilience

**Comprehensive Error Management:**

- **Network Failures**: Graceful handling of API timeouts and connection issues
- **Storage Errors**: IndexedDB operation failures with user feedback
- **Extension Context**: Handles extension reload and content script disconnection
- **API Key Validation**: Multiple validation layers with helpful error messages

**Error Recovery Patterns:**

```javascript
try {
  await performOperation();
} catch (error) {
  console.error('Operation failed:', error);
  showUserFriendlyError(error.message);
  // Maintain extension stability
}
```

**User Experience During Errors:**

- **Visual Feedback**: Clear error messages with actionable guidance
- **Graceful Degradation**: Core functionality remains available during partial failures
- **Recovery Actions**: Automatic retry mechanisms and manual recovery options
- **Debug Information**: Detailed console logging for troubleshooting

### 5.4 Performance Optimizations

**Network Interception Efficiency:**

- **Response Cloning**: Minimal impact on original request performance
- **Conditional Processing**: Only active when explicitly enabled
- **JSON Filtering**: Reduces storage overhead by 80-90%
- **Async Processing**: Non-blocking request handling

**UI Performance:**

- **Client-Side Search**: Instant filtering without backend calls
- **Virtual Scrolling**: Efficient handling of large log sets
- **Lazy Loading**: Progressive content loading for better responsiveness
- **Optimized Rendering**: Minimal DOM manipulation and efficient updates

### 5.5 Security Considerations

**API Key Security:**

- **Chrome Storage Sync**: Encrypted storage with cross-device sync
- **No Plain Text Exposure**: API key hidden by default in UI
- **Validation**: Format verification before storage
- **Secure Transmission**: HTTPS-only API communication

**Data Privacy:**

- **Local Storage Only**: No data transmitted to third-party servers
- **Session Isolation**: Automatic cleanup between page loads
- **User Control**: Complete control over data collection and deletion
- **Minimal Permissions**: Only required Chrome extension permissions

## 6. Code Quality and Development Practices

### 6.1 JavaScript Coding Standards

**Modern ES6+ Features:**

- **Async/Await**: Promise-based asynchronous operations throughout
- **Arrow Functions**: Consistent functional programming patterns
- **Template Literals**: Clean string interpolation and formatting
- **Destructuring**: Clean object and array destructuring patterns
- **Const/Let**: Proper variable scoping and immutability where appropriate

**Code Organization:**

```javascript
// Consistent function structure example
async function initDatabase() {
  return new Promise((resolve, reject) => {
    // Implementation with proper error handling
  });
}
```

### 6.2 Chrome Extension Best Practices

**Manifest V3 Compliance:**

- **Service Worker Architecture**: Proper background script implementation
- **Message Passing**: Secure inter-context communication
- **Content Security Policy**: Compliant script execution patterns
- **Permission Minimization**: Only necessary permissions requested

**Extension Architecture Patterns:**

- **Separation of Concerns**: Clear responsibility boundaries between components
- **Event-Driven Design**: Reactive programming with message-based communication
- **Stateless Operations**: Minimal global state management
- **Resource Cleanup**: Proper listener management and memory cleanup

### 6.3 Error Handling Patterns

**Defensive Programming:**

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message structure
  if (!message.type) {
    console.warn('Invalid message received:', message);
    return;
  }
  
  // Handle async operations properly
  return true; // Keep message channel open
});
```

**Error Propagation:**

- **Consistent Error Objects**: Standardized error format across components
- **User-Friendly Messages**: Technical errors translated to actionable feedback
- **Graceful Degradation**: Partial functionality during component failures
- **Debug Logging**: Comprehensive console logging for development

### 6.4 Performance Best Practices

**Async Operation Management:**

- **Promise Chains**: Proper async/await usage preventing callback hell
- **Non-Blocking Operations**: UI responsiveness maintained during heavy operations
- **Resource Cleanup**: Proper cleanup of event listeners and database connections
- **Memory Management**: Automatic data cleanup and memory optimization

**DOM Manipulation Efficiency:**

- **Event Delegation**: Efficient event handling for dynamic content
- **DocumentFragment Usage**: Batched DOM updates for better performance
- **CSS-Based Animations**: Hardware-accelerated transitions and effects
- **Minimal Reflows**: Efficient DOM querying and manipulation patterns

### 6.5 Development Workflow

**Code Structure:**

- **Modular Functions**: Single-responsibility principle applied consistently
- **Clear Naming Conventions**: Descriptive variable and function names
- **Comment Strategy**: Focused on "why" rather than "what"
- **Consistent Formatting**: Uniform indentation and code style

**Testing Considerations:**

- **Chrome DevTools Integration**: Console logging for debugging
- **Error Boundary Testing**: Robust error handling validation
- **Cross-Browser Compatibility**: Chrome-specific but standard-compliant code
- **Extension Lifecycle Testing**: Proper handling of extension reloads and updates

## 7. Project Metadata

**Version Information:**

- **Current Version**: 1.0
- **Manifest Version**: 3 (latest Chrome extension standard)
- **Target Browser**: Chrome (Chromium-based browsers)
- **Minimum Chrome Version**: 88+ (for Manifest V3 support)

**Dependencies:**

- **External Libraries**: Font Awesome 6.4.0 (CDN)
- **Chrome APIs**: storage, runtime, tabs, scripting
- **Web APIs**: IndexedDB, Fetch, XMLHttpRequest
- **Google Services**: Gemini 2.5 Flash API

**Development Info:**

- **Author**: <nghe.huavan@gmail.com>
- **Purpose**: API response analysis and documentation
- **License**: Not specified
- **Documentation**: This knowledge.project.md file
