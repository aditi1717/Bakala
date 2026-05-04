
/**
 * Utility to persist File objects in IndexedDB for the restaurant onboarding flow.
 * This ensures that uploaded files are not lost on page refresh or navigation.
 */

const DB_NAME = "RestaurantOnboardingDB";
const STORE_NAME = "onboarding_files";
const DB_VERSION = 1;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject("IndexedDB error: " + event.target.errorCode);
    };
  });
};

export const saveFileToDB = async (key, file) => {
  if (!file) return;
  // Support both File and Blob (IndexedDB may restore File as Blob)
  const isBlobLike = file instanceof Blob || (file && typeof file.size === 'number' && typeof file.type === 'string');
  if (!isBlobLike) return;
  
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(file, key);
  } catch (error) {
    console.error("Failed to save file to IndexedDB:", error);
  }
};

export const saveFileListToDB = async (key, files) => {
  if (!Array.isArray(files)) return;
  // Support both File and Blob
  const validFiles = files.filter(f => f instanceof Blob || (f && typeof f.size === 'number' && typeof f.type === 'string'));
  
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(validFiles, key);
  } catch (error) {
    console.error("Failed to save file list to IndexedDB:", error);
  }
};

export const getFileFromDB = async (key) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to get file from IndexedDB:", error);
    return null;
  }
};

export const clearOnboardingFiles = async () => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
  } catch (error) {
    console.error("Failed to clear IndexedDB:", error);
  }
};
