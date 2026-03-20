import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
let firebaseSetupError = "";

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Firebase Initialization
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : JSON.parse(fs.readFileSync(path.join(__dirname, "firebaseKey.json"), "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✓ Firebase connected");
} catch (err) {
  firebaseSetupError = `Firebase initialization failed: ${err?.message || "Unknown error"}`;
  console.error("✗ Firebase connection failed:", err.message);
  console.log(
    "Set FIREBASE_SERVICE_ACCOUNT_JSON (recommended for hosting) or ensure firebaseKey.json exists in project root"
  );
}

const db = admin.apps.length ? admin.firestore() : null;

const getFirebaseSetupErrorMessage = () => {
  return (
    firebaseSetupError ||
    "Firebase is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT_JSON and redeploy."
  );
};

const ensureFirebaseReady = (res) => {
  if (db) return true;
  res.status(503).json({ error: getFirebaseSetupErrorMessage() });
  return false;
};

const isFirestoreUnavailableError = (error) => {
  const message = String(error?.message || "");
  return (
    message.includes("PERMISSION_DENIED") ||
    message.includes("firestore.googleapis.com") ||
    message.includes("Cloud Firestore API has not been used") ||
    message.includes("5 NOT_FOUND") ||
    message.includes("The database (default) does not exist") ||
    error?.code === 7
  );
};

const getFirestoreSetupErrorMessage = (error) => {
  const message = String(error?.message || "");
  if (message.includes("5 NOT_FOUND") || message.includes("The database (default) does not exist")) {
    return "Cloud Firestore is enabled, but no Firestore database exists yet. Create a Firestore database in Firebase Console (Firestore Database) and retry.";
  }

  return "Cloud Firestore API is disabled or not ready for this project. Enable it in Google Cloud, then wait a few minutes and retry.";
};

const getUserEntriesCollection = (uid) => db.collection("users").doc(uid).collection("entries");
const getUserSettingsCollection = (uid) => db.collection("users").doc(uid).collection("settings");

const buildAuthToken = (user) => {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      name: user.name,
      username: user.username || "",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const ensureUserDefaults = async (uid, profile = {}) => {
  await getUserSettingsCollection(uid)
    .doc("profile")
    .set(
      {
        name: profile.name || "OJT Trainee",
        position: profile.position || "",
        company: profile.company || "",
        email: profile.email || "",
        department: profile.department || "",
        supervisor: profile.supervisor || "",
      },
      { merge: true }
    );

  await getUserSettingsCollection(uid)
    .doc("preferences")
    .set(
      {
        lunchStartHour: 11,
        lunchEndHour: 12,
      },
      { merge: true }
    );
};

const authMiddleware = async (req, res, next) => {
  if (!ensureFirebaseReady(res)) {
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let decoded = null;
    let userDoc = null;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded?.uid) {
        return res.status(401).json({ error: "Invalid authentication token" });
      }
      userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists) {
        return res.status(401).json({ error: "User not found" });
      }
    } catch {
      const firebaseDecoded = await admin.auth().verifyIdToken(token);
      const firebaseUid = firebaseDecoded.uid;
      const firebaseEmail = (firebaseDecoded.email || "").toLowerCase();
      const firebaseName = firebaseDecoded.name || "OJT Trainee";

      userDoc = await db.collection("users").doc(firebaseUid).get();

      if (!userDoc.exists) {
        const newUser = {
          name: firebaseName,
          email: firebaseEmail,
          username: firebaseEmail.split("@")[0] || `user_${firebaseUid.slice(0, 6)}`,
          authProvider: "google",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection("users").doc(firebaseUid).set(newUser);
        await ensureUserDefaults(firebaseUid, {
          name: firebaseName,
          email: firebaseEmail,
        });
        userDoc = await db.collection("users").doc(firebaseUid).get();
      }

      decoded = { uid: firebaseUid, email: firebaseEmail, name: firebaseName };
    }

    const userData = userDoc.data() || {};
    req.user = {
      uid: userDoc.id,
      email: userData.email || decoded.email || "",
      name: userData.name || decoded.name || "OJT Trainee",
      username: userData.username || decoded.username || "",
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

app.post("/api/auth/signup", async (req, res) => {
  if (!ensureFirebaseReady(res)) {
    return;
  }

  try {
    const { username, name, email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const displayName = String(name || "").trim();

    if (!displayName || !normalizedEmail || !normalizedUsername || !password) {
      return res
        .status(400)
        .json({ error: "Username, name, email, and password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    if (!/^[a-z0-9._-]{3,30}$/.test(normalizedUsername)) {
      return res.status(400).json({
        error: "Username must be 3-30 chars and can only contain letters, numbers, dot, underscore, and hyphen",
      });
    }

    const existing = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (!existing.empty) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const existingUsername = await db
      .collection("users")
      .where("username", "==", normalizedUsername)
      .limit(1)
      .get();

    if (!existingUsername.empty) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const userRef = await db.collection("users").add({
      name: displayName,
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      authProvider: "local",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await ensureUserDefaults(userRef.id, {
      name: displayName,
      email: normalizedEmail,
    });

    const user = {
      id: userRef.id,
      name: displayName,
      email: normalizedEmail,
      username: normalizedUsername,
    };

    const token = buildAuthToken(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return res.status(503).json({ error: getFirestoreSetupErrorMessage(error) });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!ensureFirebaseReady(res)) {
    return;
  }

  try {
    const { identifier, email, password } = req.body || {};
    const normalizedIdentifier = String(identifier || email || "").trim().toLowerCase();

    if (!normalizedIdentifier || !password) {
      return res.status(400).json({ error: "Username/email and password are required" });
    }

    const isEmailIdentifier = normalizedIdentifier.includes("@");

    const snapshot = isEmailIdentifier
      ? await db.collection("users").where("email", "==", normalizedIdentifier).limit(1).get()
      : await db.collection("users").where("username", "==", normalizedIdentifier).limit(1).get();

    if (snapshot.empty) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    const doc = snapshot.docs[0];
    const userData = doc.data() || {};
    const isValidPassword = await bcrypt.compare(String(password), userData.passwordHash || "");

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }

    await doc.ref.set(
      {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const user = {
      id: doc.id,
      name: userData.name || "OJT Trainee",
      email: userData.email || "",
      username: userData.username || "",
    };

    const token = buildAuthToken(user);
    return res.json({ token, user });
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return res.status(503).json({ error: getFirestoreSetupErrorMessage(error) });
    }
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/google", async (req, res) => {
  if (!ensureFirebaseReady(res)) {
    return;
  }

  try {
    const { firebaseIdToken } = req.body || {};

    if (!firebaseIdToken) {
      return res.status(400).json({ error: "firebaseIdToken is required" });
    }

    const decoded = await admin.auth().verifyIdToken(firebaseIdToken);
    const uid = decoded.uid;
    const email = (decoded.email || "").toLowerCase();
    const name = decoded.name || "OJT Trainee";
    const fallbackUsername = email.split("@")[0] || `user_${uid.slice(0, 6)}`;

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        name,
        email,
        username: fallbackUsername,
        authProvider: "google",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await ensureUserDefaults(uid, { name, email });
    } else {
      await userRef.set(
        {
          name,
          email,
          authProvider: "google",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    const latestUserDoc = await userRef.get();
    const data = latestUserDoc.data() || {};
    const user = {
      id: uid,
      name: data.name || name,
      email: data.email || email,
      username: data.username || fallbackUsername,
    };

    const token = buildAuthToken(user);
    return res.json({ token, user });
  } catch (error) {
    if (isFirestoreUnavailableError(error)) {
      return res.status(503).json({ error: getFirestoreSetupErrorMessage(error) });
    }
    return res.status(401).json({ error: error.message || "Google authentication failed" });
  }
});

app.get("/api/health", (req, res) => {
  return res.json({ ok: true });
});

app.use("/api", authMiddleware);

// Routes for Entries
app.get("/api/entries", async (req, res) => {
  try {
    const snapshot = await getUserEntriesCollection(req.user.uid)
      .orderBy("date", "desc")
      .get();
    const entries = [];
    snapshot.forEach((doc) => {
      entries.push({ _id: doc.id, ...doc.data() });
    });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/entries", async (req, res) => {
  try {
    const docRef = await getUserEntriesCollection(req.user.uid).add({
      ...req.body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await docRef.get();
    res.json({ _id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/entries/:id", async (req, res) => {
  try {
    await getUserEntriesCollection(req.user.uid).doc(req.params.id).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await getUserEntriesCollection(req.user.uid).doc(req.params.id).get();
    res.json({ _id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/entries/:id", async (req, res) => {
  try {
    await getUserEntriesCollection(req.user.uid).doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes for Preferences
app.get("/api/preferences", async (req, res) => {
  try {
    const docRef = getUserSettingsCollection(req.user.uid).doc("preferences");
    const doc = await docRef.get();

    if (doc.exists) {
      res.json(doc.data());
    } else {
      const defaultPrefs = {
        lunchStartHour: 11,
        lunchEndHour: 12,
      };
      await docRef.set(defaultPrefs);
      res.json(defaultPrefs);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/preferences", async (req, res) => {
  try {
    const docRef = getUserSettingsCollection(req.user.uid).doc("preferences");
    await docRef.set(req.body, { merge: true });
    const doc = await docRef.get();
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes for Profile
app.get("/api/profile", async (req, res) => {
  try {
    const docRef = getUserSettingsCollection(req.user.uid).doc("profile");
    const doc = await docRef.get();

    if (doc.exists) {
      res.json(doc.data());
    } else {
      const defaultProfile = {
        name: req.user.name || "OJT Trainee",
        position: "",
        company: "",
        email: req.user.email || "",
        department: "",
        supervisor: "",
      };
      await docRef.set(defaultProfile);
      res.json(defaultProfile);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/profile", async (req, res) => {
  try {
    const docRef = getUserSettingsCollection(req.user.uid).doc("profile");
    await docRef.set(req.body, { merge: true });

    if (req.body?.name || req.body?.email) {
      await db
        .collection("users")
        .doc(req.user.uid)
        .set(
          {
            name: req.body?.name || req.user.name,
            email: req.body?.email || req.user.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    }

    const doc = await docRef.get();
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ OJT Tracker API running on 0.0.0.0:${PORT}`);
});
