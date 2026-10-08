import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, onSnapshot, query, limit, getDocs, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || import.meta.env.VITE_GCP_PROJECT_ID || 'ultron-ai-cloud',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let db = null;
let isInitialized = false;

// Check if minimal required configuration is present
const hasConfig = Boolean(firebaseConfig.projectId && (firebaseConfig.apiKey || import.meta.env.VITE_FIREBASE_ENABLE === 'true'));

if (hasConfig) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    isInitialized = true;
    console.info('🔥 [Firestore] Connected to Google Cloud Firestore (Project:', firebaseConfig.projectId, ')');
  } catch (err) {
    console.warn('⚠️ [Firestore] Initialization notice:', err.message);
    db = null;
    isInitialized = false;
  }
} else {
  console.info('ℹ️ [Firestore] Realtime push idle (Set VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID to activate)');
}

export function isFirestoreAvailable() {
  return isInitialized && db !== null;
}

/**
 * Subscribes in real-time to the 'incidents' collection in Google Cloud Firestore.
 * Pushes updates instantaneously (<100ms) over persistent WebSockets.
 *
 * @param {Function} onUpdate - callback when incident documents change
 * @param {Function} onError - optional error handler
 * @returns {Function|null} unsubscribe cleanup function, or null if Firestore is not enabled
 */
export function subscribeToIncidents(onUpdate, onError) {
  if (!isFirestoreAvailable()) {
    return null;
  }

  try {
    const incidentsCol = collection(db, 'incidents');
    // Query ordered by syncedAt descending, limit to latest 50
    const q = query(incidentsCol, limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveIncidents = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        liveIncidents.push({
          incidentId: data.incidentId || doc.id,
          incidentNumber: data.incidentNumber || doc.id,
          serviceName: data.serviceName || 'unknown-service',
          title: data.title || 'Untitled Incident',
          severity: data.severity || 'P2',
          status: data.status || 'INVESTIGATED',
          rootCause: data.rootCause || '',
          rcaSummary: data.rcaSummary || '',
          suggestedFix: data.suggestedFix || '',
          impactAnalysis: data.impactAnalysis || '',
          prevention: data.prevention || '',
          confidence: data.confidence != null ? Number(data.confidence) : 0.95,
          detectedAt: data.detectedAt || data.syncedAt || data.createdAt || new Date().toISOString(),
          createdAt: data.createdAt || data.syncedAt || new Date().toISOString(),
          syncedAt: data.syncedAt || null,
          isLiveSynced: true,
        });
      });

      // Sort in memory by detectedAt / createdAt descending
      liveIncidents.sort((a, b) => {
        const timeA = new Date(a.detectedAt || a.createdAt).getTime();
        const timeB = new Date(b.detectedAt || b.createdAt).getTime();
        return timeB - timeA;
      });

      onUpdate(liveIncidents);
    }, (err) => {
      console.warn('⚠️ [Firestore] Snapshot subscription notice:', err.message);
      if (onError) onError(err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('⚠️ [Firestore] Failed to attach snapshot listener:', err.message);
    if (onError) onError(err);
    return null;
  }
}

/**
 * Purges all incident documents in Google Cloud Firestore.
 * Used during factory resets to keep cloud storage synchronized with PostgreSQL.
 */
export async function clearFirestoreIncidents() {
  if (!isFirestoreAvailable()) {
    return;
  }
  try {
    const incidentsCol = collection(db, 'incidents');
    const snapshot = await getDocs(incidentsCol);
    const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(docSnap.ref));
    await Promise.all(deletePromises);
    console.info(`🔥 [Firestore] Successfully cleared ${snapshot.size} incidents from Firestore`);
  } catch (err) {
    console.warn('⚠️ [Firestore] Failed to clear incidents from Firestore:', err.message);
  }
}

