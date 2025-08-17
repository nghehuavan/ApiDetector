// content.js - Runs when a page starts loading

// Generate a unique ID for this page load session
const pageLoadId = Date.now().toString();

// Function to inject the interceptor script
function injectInterceptor() {
  // Create a script element
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('interceptor.js');
  
  // Add it to the document
  (document.head || document.documentElement).appendChild(script);
  
  // Remove it after it's loaded (optional)
  script.onload = function() {
    script.remove();
  };
}

// Check if the site is deactivated before injecting
chrome.storage.local.get('deactivatedSites', ({ deactivatedSites }) => {
  const sites = deactivatedSites || [];
  const isDeactivated = sites.includes(window.location.hostname);

  if (!isDeactivated) {
    injectInterceptor();
  }
});

// Listen for messages from the interceptor script
window.addEventListener('message', function(event) {
  // Only accept messages from the same frame
  if (event.source !== window) return;
  
  // Check if the message is from our interceptor
  if (event.data.type && event.data.type === 'INTERCEPTED_REQUEST') {
    // Add the pageLoadId to the data
    const dataWithSessionId = {
      ...event.data,
      pageLoadId: pageLoadId
    };
    
    // Forward the data to the background script
    chrome.runtime.sendMessage(dataWithSessionId);
  }
});

// Inform the background script about the new page load
chrome.runtime.sendMessage({
  type: 'NEW_PAGE_LOAD',
  pageLoadId: pageLoadId
});

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === 'GET_PAGE_LOAD_ID') {
    sendResponse({ pageLoadId: pageLoadId });
  } else if (request.type === 'SET_ACTIVATION_STATE') {
    window.postMessage({
      type: 'GEMINI_INTERCEPTOR_STATE',
      isActive: request.isActive
    }, '*');
    sendResponse({ status: 'ok' });
  }
  return true; // Keep the message channel open for async response
});