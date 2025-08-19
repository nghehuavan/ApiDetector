// popup.js - Handles the popup UI functionality

// Store the current page load ID
let currentPageLoadId = null;

// DOM elements
const searchInput = document.getElementById('searchInput');
const logsCountElement = document.getElementById('logsCount');
const logsListElement = document.getElementById('logsList');
const questionInput = document.getElementById('questionInput');
const askButton = document.getElementById('askButton');
const answerContainer = document.getElementById('answerContainer');
const answerText = document.getElementById('answerText');
const refreshButton = document.getElementById('refreshButton');
const clearAllButton = document.getElementById('clearAllButton');
const siteToggle = document.getElementById('siteToggle');
const siteToggleLabel = document.getElementById('siteToggleLabel');

// Get the current page load ID from the active tab
function getCurrentPageLoadId() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.warn('getCurrentPageLoadId: No active tab found.');
        reject(new Error('No active tab found'));
        return;
      }

      console.log('getCurrentPageLoadId: Sending GET_PAGE_LOAD_ID to tab:', tabs[0].id);
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_LOAD_ID' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('getCurrentPageLoadId: chrome.runtime.lastError:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        if (!response || !response.pageLoadId) {
          console.warn('getCurrentPageLoadId: Failed to get page load ID from response:', response);
          reject(new Error('Failed to get page load ID'));
          return;
        }

        console.log('getCurrentPageLoadId: Received pageLoadId:', response.pageLoadId);
        resolve(response.pageLoadId);
      });
    });
  });
}

// Load logs for the current page load session
function loadLogs() {
  logsCountElement.textContent = 'Loading...';

  chrome.runtime.sendMessage({ type: 'GET_LOGS', pageLoadId: currentPageLoadId }, (response) => {
    if (chrome.runtime.lastError) {
      logsCountElement.textContent = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }

    if (response.error) {
      logsCountElement.textContent = `Error: ${response.error}`;
      return;
    }

    const logs = response.logs || [];
    displayLogs(logs);
  });
}

// Display logs in the UI
function displayLogs(logs) {
  logsListElement.innerHTML = '';

  if (logs.length === 0) {
    logsListElement.innerHTML = '<div class="no-logs">No JSON responses captured yet</div>';
    logsCountElement.textContent = '0 JSON responses captured';
    return;
  }

  // Sort logs by timestamp (newest first)
  logs.sort((a, b) => b.timestamp - a.timestamp);

  // Apply search filter if needed
  const searchTerm = searchInput.value.toLowerCase();
  let filteredLogs = logs;

  if (searchTerm) {
    if (searchTerm.startsWith('!')) {
      const excludeKeyword = searchTerm.substring(1).trim();
      if (excludeKeyword) {
        filteredLogs = logs.filter((log) => {
          return !(log.url.toLowerCase().includes(excludeKeyword) || log.responseBody.toLowerCase().includes(excludeKeyword));
        });
      }
    } else {
      filteredLogs = logs.filter((log) => {
        return log.url.toLowerCase().includes(searchTerm) || log.responseBody.toLowerCase().includes(searchTerm);
      });
    }
  }

  // Create log elements
  filteredLogs.forEach((log) => {
    const logElement = document.createElement('div');
    logElement.className = 'log-item';

    // Try to parse the JSON for pretty display
    let formattedJson = log.responseBody;
    try {
      const jsonObj = JSON.parse(log.responseBody);
      formattedJson = JSON.stringify(jsonObj, null, 2);
    } catch (e) {
      // If parsing fails, use the raw response
      console.warn('Failed to parse JSON:', e);
    }

    // Create the log content
    logElement.innerHTML = `
      <div class="log-header">
        <div class="log-info">
          <div class="log-url">${log.url}</div>
          <div class="log-method">${log.method}</div>
        </div>
        <div class="log-actions">
          <button class="copy-button" title="Copy to clipboard">
            <i class="fas fa-copy"></i>
          </button>
          <button class="delete-button" title="Delete Log" data-log-id="${log.id}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="log-body-container">
        <pre class="log-body">${formattedJson}</pre>
      </div>
    `;

    // Add click handler to expand/collapse the log
    logElement.querySelector('.log-info').addEventListener('click', () => {
      logElement.classList.toggle('expanded');
    });

    // Add click handler for the copy button
    const copyButton = logElement.querySelector('.copy-button');
    if (copyButton) {
      copyButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering the expand/collapse
        const contentToCopy = `URL: ${log.url}\n\nResponse Body:\n${formattedJson}`;
        navigator.clipboard
          .writeText(contentToCopy)
          .then(() => {
            // Visual feedback for successful copy
            copyButton.classList.add('copied');
            setTimeout(() => {
              copyButton.classList.remove('copied');
            }, 1500);
          })
          .catch((err) => {
            console.error('Failed to copy text: ', err);
          });
      });
    }

    // Add click handler for the delete button
    const deleteButton = logElement.querySelector('.delete-button');
    if (deleteButton) {
      deleteButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering the expand/collapse
        const logIdToDelete = e.currentTarget.dataset.logId;
        if (logIdToDelete) {
          chrome.runtime.sendMessage({ type: 'DELETE_LOG', logId: logIdToDelete, pageLoadId: currentPageLoadId }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('DELETE_LOG error:', chrome.runtime.lastError);
              return;
            }
            if (response && response.success) {
              loadLogs(); // Reload logs after successful deletion
            } else {
              console.error('Failed to delete log:', response.error);
            }
          });
        }
      });
    }

    logsListElement.appendChild(logElement);
  });

  logsCountElement.textContent = `${filteredLogs.length} of ${logs.length} JSON responses captured`;
}

// Ask Gemini a question about the logs
function askGemini() {
  const question = questionInput.value.trim();

  if (!question) {
    showAnswer('Error: Please enter a question');
    return;
  }

  // Disable the button and show loading state
  askButton.disabled = true;
  const originalButtonContent = askButton.innerHTML;
  askButton.innerHTML = '<div class="loading-spinner"></div>';
  answerContainer.classList.add('hidden');

  // Send the question to the background script
  chrome.runtime.sendMessage(
    {
      type: 'ASK_GEMINI',
      pageLoadId: currentPageLoadId,
      question: question,
    },
    (response) => {
      // Re-enable the button
      askButton.disabled = false;
      askButton.innerHTML = originalButtonContent;

      if (chrome.runtime.lastError) {
        showAnswer(`Error: ${chrome.runtime.lastError.message}`);
        return;
      }

      if (response.error) {
        showAnswer(`Error: ${response.error}`);
        return;
      }

      showAnswer(response.answer);
    }
  );
}

// Show the Gemini answer in the UI
function showAnswer(answer) {
  // Check if it's an error message
  if (answer.startsWith('Error:')) {
    answerText.innerHTML = `<div class="error-message">${answer}</div>`;

    // If it's an API key error, add a link to settings
    if (answer.includes('API key')) {
      answerText.innerHTML += `<div class="help-text">Please check your <span id="settingsLink" class="link-style">API key settings</span>.</div>`;
      // Add event listener to the dynamically created link
      document.getElementById('settingsLink').addEventListener('click', () => {
        settingsButton.click(); // Simulate a click on the settings button
      });
    }
  } else {
    answerText.textContent = answer;
  }

  answerContainer.classList.remove('hidden');
}

// Initialize the popup
async function initPopup() {
  try {
    // Get the current page load ID
    currentPageLoadId = await getCurrentPageLoadId();

    // Load the logs
    loadLogs();

    // Set up event listeners
    searchInput.addEventListener('input', () => {
      loadLogs(); // Reload logs with the new search term
    });

    questionInput.addEventListener('input', () => {
      chrome.storage.local.set({ savedQuestion: questionInput.value });
    });

    askButton.addEventListener('click', askGemini);
    refreshButton.addEventListener('click', loadLogs);
    clearAllButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'CLEAR_ALL_LOGS' }, () => {
        loadLogs();
      });
    });

    // Set up the site toggle
    setupSiteToggle();

    // Load API key (the settings view can be accessed manually if needed)
    loadApiKey();

    // Load saved question from local storage
    chrome.storage.local.get('savedQuestion', (result) => {
      if (result.savedQuestion) {
        questionInput.value = result.savedQuestion;
      }
    });
  } catch (error) {
    logsCountElement.textContent = `Error: ${error.message}`;
    console.error('Popup initialization error:', error);
  }
}

// Start the popup when the DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
  initPopup();
  initSettings(); // This will now only set up event listeners, as loadApiKey is moved
});

// Handle the site-specific activation toggle
function setupSiteToggle() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      return;
    }
    const url = new URL(tabs[0].url);
    const hostname = url.hostname;

    const updateToggleState = (isEnabled) => {
      siteToggle.checked = isEnabled;
      siteToggleLabel.textContent = isEnabled ? 'Enabled' : 'Disabled';
    };

    // Get initial state
    chrome.storage.local.get('enabledDomains', ({ enabledDomains }) => {
      const domains = enabledDomains || [];
      updateToggleState(domains.includes(hostname));
    });

    // Add change listener
    siteToggle.addEventListener('change', () => {
      chrome.storage.local.get('enabledDomains', ({ enabledDomains }) => {
        let domains = enabledDomains || [];
        const isEnabling = siteToggle.checked;

        if (isEnabling) {
          if (!domains.includes(hostname)) {
            domains.push(hostname);
          }
        } else {
          domains = domains.filter((domain) => domain !== hostname);
        }

        chrome.storage.local.set({ enabledDomains: domains }, () => {
          updateToggleState(isEnabling);
          // Send message to content script
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'SET_ACTIVATION_STATE',
                isActive: isEnabling,
              });
            }
          });
        });
      });
    });
  });
}

// DOM elements for settings view
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const settingsButton = document.getElementById('settingsButton');
const backButton = document.getElementById('backButton');
const apiProviderSelect = document.getElementById('apiProviderSelect');
const geminiSettings = document.getElementById('geminiSettings');
const openrouterSettings = document.getElementById('openrouterSettings');
const apiKeyInput = document.getElementById('apiKeyInput');
const openrouterApiKeyInput = document.getElementById('openrouterApiKeyInput');
const toggleGeminiVisibility = document.getElementById('toggleGeminiVisibility');
const toggleOpenRouterVisibility = document.getElementById('toggleOpenRouterVisibility');
const saveButton = document.getElementById('saveButton');
const clearSettingsButton = document.getElementById('clearSettingsButton');
const statusMessage = document.getElementById('statusMessage');

// Add settings button functionality
settingsButton.addEventListener('click', function () {
  // Switch to settings view
  mainView.classList.add('hidden');
  settingsView.classList.remove('hidden');
  loadApiKey(); // Ensure key is loaded when manually opening settings
});

// Add back button functionality
backButton.addEventListener('click', function () {
  // Switch back to main view
  settingsView.classList.add('hidden');
  mainView.classList.remove('hidden');
});

// Handle API provider selection change
apiProviderSelect.addEventListener('change', function () {
  if (this.value === 'gemini') {
    geminiSettings.classList.remove('hidden');
    openrouterSettings.classList.add('hidden');
  } else {
    geminiSettings.classList.add('hidden');
    openrouterSettings.classList.remove('hidden');
  }
});

// Load the saved API key and provider
function loadApiKey() {
  chrome.storage.sync.get(['apiProvider', 'geminiApiKey', 'openrouterApiKey'], (result) => {
    const apiProvider = result.apiProvider || 'gemini';
    apiProviderSelect.value = apiProvider;

    if (apiProvider === 'gemini') {
      geminiSettings.classList.remove('hidden');
      openrouterSettings.classList.add('hidden');
    } else {
      geminiSettings.classList.add('hidden');
      openrouterSettings.classList.remove('hidden');
    }

    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    } else {
      apiKeyInput.value = '';
    }

    if (result.openrouterApiKey) {
      openrouterApiKeyInput.value = result.openrouterApiKey;
    } else {
      openrouterApiKeyInput.value = '';
    }
  });
}

// Save the API key and provider
function saveApiKey() {
  const apiProvider = apiProviderSelect.value;
  const geminiApiKey = apiKeyInput.value.trim();
  const openrouterApiKey = openrouterApiKeyInput.value.trim();

  if (apiProvider === 'gemini' && !geminiApiKey) {
    showStatus('Please enter a Gemini API key', 'error');
    return;
  }

  if (apiProvider === 'openrouter' && !openrouterApiKey) {
    showStatus('Please enter an OpenRouter API key', 'error');
    return;
  }

  chrome.storage.sync.set(
    {
      apiProvider: apiProvider,
      geminiApiKey: geminiApiKey,
      openrouterApiKey: openrouterApiKey,
    },
    () => {
      showStatus('Settings saved successfully!', 'success');
      // If successful, navigate back to main view
      settingsView.classList.add('hidden');
      mainView.classList.remove('hidden');
    }
  );
}

// Clear the API key and provider
function clearApiKey() {
  apiKeyInput.value = '';
  openrouterApiKeyInput.value = '';
  chrome.storage.sync.remove(['apiProvider', 'geminiApiKey', 'openrouterApiKey'], () => {
    showStatus('Settings cleared', 'info');
  });
}

// Toggle API key visibility
function toggleVisibility(inputElement, buttonElement) {
  const iconElement = buttonElement.querySelector('i');
  if (inputElement.type === 'password') {
    inputElement.type = 'text';
    if (iconElement) {
      iconElement.classList.remove('fa-eye');
      iconElement.classList.add('fa-eye-slash');
    }
  } else {
    inputElement.type = 'password';
    if (iconElement) {
      iconElement.classList.remove('fa-eye-slash');
      iconElement.classList.add('fa-eye');
    }
  }
}

// Show status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type} visible`; // Add 'visible' class

  // Clear the message after 3 seconds
  setTimeout(() => {
    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
  }, 3000);
}

// Set up settings event listeners
function setupSettingsEventListeners() {
  saveButton.addEventListener('click', saveApiKey);
  clearSettingsButton.addEventListener('click', clearApiKey);
  toggleGeminiVisibility.addEventListener('click', () => toggleVisibility(apiKeyInput, toggleGeminiVisibility));
  toggleOpenRouterVisibility.addEventListener('click', () => toggleVisibility(openrouterApiKeyInput, toggleOpenRouterVisibility));
}

// Initialize settings functionality
function initSettings() {
  setupSettingsEventListeners();
}
