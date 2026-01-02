async function exportIndexedDB(tab) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const dump = {};
      const dbs = await indexedDB.databases();

      for (const db of dbs) {
        dump[db.name] = {};
        const open = indexedDB.open(db.name);

        await new Promise(res => {
          open.onsuccess = () => {
            const database = open.result;
            database.objectStoreNames.forEach(store => {
              const tx = database.transaction(store, "readonly");
              const os = tx.objectStore(store);
              const req = os.getAll();
              req.onsuccess = () => {
                dump[db.name][store] = req.result;
                res();
              };
            });
          };
        });
      }
      return dump;
    }
  });

  return result;
}

function download(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const url = "data:application/json;charset=utf-8," + encodeURIComponent(json);
  chrome.downloads.download({ url, filename });
}
