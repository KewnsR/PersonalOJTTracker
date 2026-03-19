import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

let cachedAuth = null;

export const getFirebaseAuthClient = () => {
  if (!isFirebaseConfigured) {
    return null;
  }

  if (cachedAuth) {
    return cachedAuth;
  }

  const app = initializeApp(firebaseConfig);
  cachedAuth = getAuth(app);
  return cachedAuth;
};
