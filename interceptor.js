// interceptor.js - Injected into the webpage to capture network traffic

(function() {
  let isActive = true;

  window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'GEMINI_INTERCEPTOR_STATE') {
      isActive = event.data.isActive;
    }
  });

  // Store original fetch and XMLHttpRequest methods
  const originalFetch = window.fetch;
  const originalXHR = window.XMLHttpRequest.prototype.open;
  const originalXHRSend = window.XMLHttpRequest.prototype.send;
  
  // Monkey-patch fetch
  window.fetch = async function(...args) {
    // Get the request URL and method
    const url = args[0] instanceof Request ? args[0].url : args[0];
    const method = args[0] instanceof Request ? args[0].method : (args[1]?.method || 'GET');
    
    // Call the original fetch
    const response = await originalFetch.apply(this, args);
    
    // Clone the response to avoid consuming it
    const responseClone = response.clone();
    
    // Try to get the response body as text
    responseClone.text().then(responseBody => {
      if (isActive) {
        // Get the Content-Type header
        const contentType = response.headers.get('Content-Type');
        
        // Send the intercepted data to content.js
        window.postMessage({
          type: 'INTERCEPTED_REQUEST',
          url: url.toString(),
          method: method,
          responseBody: responseBody,
          contentType: contentType,
          timestamp: Date.now()
        }, '*');
      }
    }).catch(error => {
      console.error('Error reading response body:', error);
    });
    
    // Return the original response
    return response;
  };
  
  // Monkey-patch XMLHttpRequest
  window.XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    // Store the request details
    this._requestMethod = method;
    this._requestUrl = url;
    
    // Call the original open method
    return originalXHR.apply(this, arguments);
  };
  
  window.XMLHttpRequest.prototype.send = function(body) {
    // Store the original onload handler
    const originalOnload = this.onload;
    
    // Set a new onload handler
    this.onload = function() {
      // Call the original onload handler if it exists
      if (originalOnload) {
        originalOnload.apply(this, arguments);
      }
      
      if (isActive) {
        // Try to get the response body
        let responseBody = this.responseText || this.response;
        
        // Get the Content-Type header
        const contentType = this.getResponseHeader('Content-Type');
        
        // Send the intercepted data to content.js
        window.postMessage({
          type: 'INTERCEPTED_REQUEST',
          url: this._requestUrl.toString(),
          method: this._requestMethod,
          responseBody: responseBody,
          contentType: contentType,
          timestamp: Date.now()
        }, '*');
      }
    };
    
    // Call the original send method
    return originalXHRSend.apply(this, arguments);
  };
  
  console.log('Gemini Interceptor: Network traffic capture initialized');
})();