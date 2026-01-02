importScripts(
  "utils/storageCollector.js",
  "utils/emailDetector.js",
  "utils/indexedDbExporter.js"
);

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "SAVE_PROFILE") {
    const origin = new URL(msg.url).origin;
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    const storageState = await collectStorage(tab, msg.url);
    const email = await detectEmail(tab);
    const indexedDB = await exportIndexedDB(tab);

    storageState.origins[0].indexedDB = indexedDB;

    const profile = {
      profileName: msg.profileName || email || "unknown",
      email,
      domain: origin,
      createdAt: new Date().toISOString(),
      storageState
    };

    chrome.storage.local.get("domains", ({ domains = {} }) => {
      domains[origin] = domains[origin] || [];
      domains[origin] = domains[origin].filter(
        p => p.profileName !== profile.profileName
      );
      domains[origin].push(profile);
      chrome.storage.local.set({ domains });
    });
  }

  if (msg.type === "EXPORT_PLAYWRIGHT") {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const storageState = await collectStorage(tab, msg.url);
    download(adaptForPlaywright(storageState), "auth.json");
  }

  if (msg.type === "LOAD_PROFILE") {
    const { cookies, origins } = msg.profile.storageState;
    const domain = msg.profile.domain;

    // 1. Create Tab first (to detect if it's incognito)
    const tab = await chrome.tabs.create({ url: domain, active: true });

    // 2. Restore Cookies (with tab ID to detect incognito)
    await restoreCookies(cookies, domain, tab.id);

    // 3. Restore LocalStorage and SessionStorage
    const listener = async (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);

        const originState = origins.find(o => new URL(o.origin).origin === new URL(domain).origin) || origins[0];

        if (originState) {
          if (originState.localStorage) await restoreLocalStorage(tab.id, originState.localStorage);
          if (originState.sessionStorage) await restoreSessionStorage(tab.id, originState.sessionStorage);

          chrome.tabs.reload(tab.id);
        }
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  }

  if (msg.type === "DOWNLOAD_PROFILE") {
    const storageState = msg.profile.storageState;
    const filename = `${(msg.profile.profileName || "profile").replace(/[^a-z0-9]/gi, '_')}_auth.json`;
    download(adaptForPlaywright(storageState), filename);
  }
});
