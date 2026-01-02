async function collectStorage(tab, url) {
  const origin = new URL(url).origin;

  const cookies = await chrome.cookies.getAll({ url });

  const [{ result: storageData }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const getItems = (store) => {
        const items = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          items.push({ name: key, value: store.getItem(key) });
        }
        return items;
      };
      return {
        localStorage: getItems(localStorage),
        sessionStorage: getItems(sessionStorage)
      };
    }
  });

  return {
    cookies: cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    })),
    origins: [
      {
        origin,
        localStorage: storageData.localStorage,
        sessionStorage: storageData.sessionStorage
      }
    ]
  };
}

async function restoreCookies(cookies, domain, targetTabId) {
  // Detect which cookie store to use (incognito vs normal)
  let storeId = "0"; // default store
  
  if (targetTabId) {
    try {
      const tab = await chrome.tabs.get(targetTabId);
      if (tab.incognito) {
        // Get the incognito store ID
        const stores = await chrome.cookies.getAllCookieStores();
        const incognitoStore = stores.find(store => 
          store.tabIds.includes(targetTabId)
        );
        if (incognitoStore) {
          storeId = incognitoStore.id;
        }
      }
    } catch (e) {
      console.warn("Error detecting cookie store:", e);
    }
  }

  try {
    const existing = await chrome.cookies.getAll({ url: domain, storeId });
    await Promise.all(existing.map(c => chrome.cookies.remove({
      url: domain,
      name: c.name,
      storeId: c.storeId
    })));
  } catch (e) {
    console.warn("Error clearing cookies:", e);
  }

  for (const c of cookies) {
    try {
      const cookieDetails = {
        url: domain,
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        storeId: storeId
      };
      if (c.expires) {
        cookieDetails.expirationDate = c.expires;
      }
      await chrome.cookies.set(cookieDetails);
    } catch (e) {
      console.warn(`Failed to set cookie ${c.name}:`, e);
    }
  }
}

async function restoreLocalStorage(tabId, localStorageData) {
  if (!localStorageData || localStorageData.length === 0) return;
  
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (items) => {
      items.forEach(({ name, value }) => {
        localStorage.setItem(name, value);
      });
    },
    args: [localStorageData]
  });
}

async function restoreSessionStorage(tabId, sessionStorageData) {
  if (!sessionStorageData || sessionStorageData.length === 0) return;
  
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (items) => {
      items.forEach(({ name, value }) => {
        sessionStorage.setItem(name, value);
      });
    },
    args: [sessionStorageData]
  });
}

function adaptForPlaywright(storageState) {
  return {
    cookies: storageState.cookies.map(c => {
      let sameSite = "Lax";

      if (c.sameSite === "no_restriction" || c.sameSite === "None") sameSite = "None";
      else if (c.sameSite === "strict" || c.sameSite === "Strict") sameSite = "Strict";
      else if (c.sameSite === "lax" || c.sameSite === "Lax") sameSite = "Lax";

      return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires !== undefined ? c.expires : -1,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: sameSite
      };
    }),
    origins: storageState.origins.map(o => ({
      origin: o.origin,
      localStorage: o.localStorage
    }))
  };
}
