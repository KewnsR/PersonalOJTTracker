import express from "express";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Firebase Initialization
try {
  const serviceAccount = JSON.parse(
    fs.readFileSync(path.join(__dirname, "firebaseKey.json"), "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✓ Firebase connected");
} catch (err) {
  console.error("✗ Firebase connection failed:", err.message);
  console.log("Make sure firebaseKey.json exists in your project root");
}

const db = admin.firestore();

// Routes for Entries
app.get("/api/entries", async (req, res) => {
  try {
    const snapshot = await db.collection("entries").orderBy("date", "desc").get();
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
    const docRef = await db.collection("entries").add({
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
    await db.collection("entries").doc(req.params.id).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const doc = await db.collection("entries").doc(req.params.id).get();
    res.json({ _id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/entries/:id", async (req, res) => {
  try {
    await db.collection("entries").doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes for Preferences
app.get("/api/preferences", async (req, res) => {
  try {
    const docRef = db.collection("settings").doc("preferences");
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
    const docRef = db.collection("settings").doc("preferences");
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
    const docRef = db.collection("settings").doc("profile");
    const doc = await docRef.get();

    if (doc.exists) {
      res.json(doc.data());
    } else {
      const defaultProfile = {
        name: "OJT Trainee",
        position: "",
        company: "",
        email: "",
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
    const docRef = db.collection("settings").doc("profile");
    await docRef.set(req.body, { merge: true });
    const doc = await docRef.get();
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✓ OJT Tracker API running on http://localhost:${PORT}`);
});
