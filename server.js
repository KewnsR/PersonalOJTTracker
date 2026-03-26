import "dotenv/config";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

let supabaseSetupError = "";

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

// Supabase Initialization
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

if (supabase) {
  console.log("✓ Supabase connected");
} else {
  supabaseSetupError =
    "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.";
  console.error("✗ Supabase connection failed: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const ensureSupabaseReady = (res) => {
  if (supabase) return true;
  res.status(503).json({ error: supabaseSetupError });
  return false;
};

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

const toUserResponse = (userRow) => ({
  id: userRow.id,
  name: userRow.name || "OJT Trainee",
  email: userRow.email || "",
  username: userRow.username || "",
});

const toEntryResponse = (entryRow) => ({
  _id: entryRow.id,
  date: entryRow.date,
  timeIn: entryRow.time_in,
  timeOut: entryRow.time_out,
  hours: entryRow.hours,
  notes: entryRow.notes || "",
  createdAt: entryRow.created_at,
  updatedAt: entryRow.updated_at,
});

const ensureUserDefaults = async (uid, profile = {}) => {
  const now = new Date().toISOString();

  const { error: profileError } = await supabase.from("user_profile").upsert(
    {
      user_id: uid,
      name: profile.name || "OJT Trainee",
      position: profile.position || "",
      company: profile.company || "",
      email: profile.email || "",
      department: profile.department || "",
      supervisor: profile.supervisor || "",
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    throw profileError;
  }

  const { error: prefError } = await supabase.from("user_preferences").upsert(
    {
      user_id: uid,
      lunch_start_hour: 11,
      lunch_end_hour: 12,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  if (prefError) {
    throw prefError;
  }
};

const authMiddleware = async (req, res, next) => {
  if (!ensureSupabaseReady(res)) {
    return;
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded?.uid) {
      return res.status(401).json({ error: "Invalid authentication token" });
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email || "",
      name: decoded.name || "OJT Trainee",
      username: decoded.username || "",
    };

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

app.post("/api/auth/signup", async (req, res) => {
  return res.status(410).json({ error: "Email/password signup is disabled. Use Google sign-in only." });
});

app.post("/api/auth/login", async (req, res) => {
  return res.status(410).json({ error: "Email/password login is disabled. Use Google sign-in only." });
});

app.post("/api/auth/google", async (req, res) => {
  if (!ensureSupabaseReady(res)) {
    return;
  }

  try {
    const { supabaseAccessToken } = req.body || {};

    if (!supabaseAccessToken) {
      return res.status(400).json({ error: "supabaseAccessToken is required" });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(supabaseAccessToken);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: authError?.message || "Invalid Supabase access token" });
    }

    const authUser = authData.user;
    const uid = authUser.id;
    const email = String(authUser.email || "").toLowerCase();
    const name =
      authUser.user_metadata?.full_name ||
      authUser.user_metadata?.name ||
      authUser.user_metadata?.preferred_username ||
      "OJT Trainee";

    if (!uid || !email) {
      return res.status(401).json({ error: "Supabase user payload is missing id/email" });
    }

    const fallbackUsername = email.split("@")[0] || `user_${uid.slice(0, 6)}`;

    const { data: existingUser, error: userFetchError } = await supabase
      .from("users")
      .select("id,name,email,username")
      .eq("id", uid)
      .maybeSingle();

    if (userFetchError) {
      throw userFetchError;
    }

    const now = new Date().toISOString();
    const userPayload = {
      id: uid,
      name: existingUser?.name || name,
      email: existingUser?.email || email,
      username: existingUser?.username || fallbackUsername,
      auth_provider: "google",
      updated_at: now,
    };

    const { data: upsertedUser, error: upsertUserError } = await supabase
      .from("users")
      .upsert(userPayload, { onConflict: "id" })
      .select("id,name,email,username")
      .single();

    if (upsertUserError) {
      throw upsertUserError;
    }

    await ensureUserDefaults(uid, {
      name: upsertedUser.name,
      email: upsertedUser.email,
    });

    const user = toUserResponse(upsertedUser);

    const token = buildAuthToken(user);
    return res.json({ token, user });
  } catch (error) {
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
    const { data, error } = await supabase
      .from("entries")
      .select("id,date,time_in,time_out,hours,notes,created_at,updated_at")
      .eq("user_id", req.user.uid)
      .order("date", { ascending: false })
      .order("time_in", { ascending: false });

    if (error) {
      throw error;
    }

    const entries = (data || []).map(toEntryResponse);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/entries", async (req, res) => {
  try {
    const now = new Date().toISOString();
    const payload = {
      user_id: req.user.uid,
      date: req.body?.date,
      time_in: req.body?.timeIn,
      time_out: req.body?.timeOut,
      hours: req.body?.hours,
      notes: req.body?.notes || "",
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("entries")
      .insert(payload)
      .select("id,date,time_in,time_out,hours,notes,created_at,updated_at")
      .single();

    if (error) {
      throw error;
    }

    res.json(toEntryResponse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/entries/:id", async (req, res) => {
  try {
    const now = new Date().toISOString();
    const updates = {
      date: req.body?.date,
      time_in: req.body?.timeIn,
      time_out: req.body?.timeOut,
      hours: req.body?.hours,
      notes: req.body?.notes || "",
      updated_at: now,
    };

    const { data, error } = await supabase
      .from("entries")
      .update(updates)
      .eq("id", req.params.id)
      .eq("user_id", req.user.uid)
      .select("id,date,time_in,time_out,hours,notes,created_at,updated_at")
      .single();

    if (error) {
      throw error;
    }

    res.json(toEntryResponse(data));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/entries/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("entries")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.uid);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes for Preferences
app.get("/api/preferences", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("lunch_start_hour,lunch_end_hour,required_ojt_hours,weekly_journal_notes,theme_mode")
      .eq("user_id", req.user.uid)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return res.json({
        lunchStartHour: data.lunch_start_hour ?? 11,
        lunchEndHour: data.lunch_end_hour ?? 12,
        requiredOjtHours: data.required_ojt_hours ?? 600,
        weeklyJournalNotes: data.weekly_journal_notes || {},
        themeMode: data.theme_mode || "dark",
      });
    }

    const now = new Date().toISOString();
    const defaultPrefs = {
      user_id: req.user.uid,
      lunch_start_hour: 11,
      lunch_end_hour: 12,
      required_ojt_hours: 600,
      weekly_journal_notes: {},
      theme_mode: "dark",
      updated_at: now,
    };

    const { error: insertError } = await supabase
      .from("user_preferences")
      .upsert(defaultPrefs, { onConflict: "user_id" });

    if (insertError) {
      throw insertError;
    }

    return res.json({
      lunchStartHour: 11,
      lunchEndHour: 12,
      requiredOjtHours: 600,
      weeklyJournalNotes: {},
      themeMode: "dark",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/preferences", async (req, res) => {
  try {
    const now = new Date().toISOString();
    const payload = {
      user_id: req.user.uid,
      lunch_start_hour: req.body?.lunchStartHour,
      lunch_end_hour: req.body?.lunchEndHour,
      required_ojt_hours: req.body?.requiredOjtHours,
      weekly_journal_notes: req.body?.weeklyJournalNotes,
      theme_mode: req.body?.themeMode,
      updated_at: now,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    const { data, error } = await supabase
      .from("user_preferences")
      .upsert(payload, { onConflict: "user_id" })
      .select("lunch_start_hour,lunch_end_hour,required_ojt_hours,weekly_journal_notes,theme_mode")
      .single();

    if (error) {
      throw error;
    }

    res.json({
      lunchStartHour: data.lunch_start_hour ?? 11,
      lunchEndHour: data.lunch_end_hour ?? 12,
      requiredOjtHours: data.required_ojt_hours ?? 600,
      weeklyJournalNotes: data.weekly_journal_notes || {},
      themeMode: data.theme_mode || "dark",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes for Profile
app.get("/api/profile", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_profile")
      .select("name,position,company,email,department,supervisor")
      .eq("user_id", req.user.uid)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return res.json({
        name: data.name || "OJT Trainee",
        position: data.position || "",
        company: data.company || "",
        email: data.email || req.user.email || "",
        department: data.department || "",
        supervisor: data.supervisor || "",
      });
    }

    const now = new Date().toISOString();
    const defaultProfile = {
      user_id: req.user.uid,
      name: req.user.name || "OJT Trainee",
      position: "",
      company: "",
      email: req.user.email || "",
      department: "",
      supervisor: "",
      updated_at: now,
    };

    const { error: profileInsertError } = await supabase
      .from("user_profile")
      .upsert(defaultProfile, { onConflict: "user_id" });

    if (profileInsertError) {
      throw profileInsertError;
    }

    return res.json({
      name: defaultProfile.name,
      position: "",
      company: "",
      email: defaultProfile.email,
      department: "",
      supervisor: "",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/profile", async (req, res) => {
  try {
    const now = new Date().toISOString();
    const profilePayload = {
      user_id: req.user.uid,
      name: req.body?.name,
      position: req.body?.position,
      company: req.body?.company,
      email: req.body?.email,
      department: req.body?.department,
      supervisor: req.body?.supervisor,
      updated_at: now,
    };

    Object.keys(profilePayload).forEach((key) => {
      if (profilePayload[key] === undefined) {
        delete profilePayload[key];
      }
    });

    const { data: profileRow, error: profileError } = await supabase
      .from("user_profile")
      .upsert(profilePayload, { onConflict: "user_id" })
      .select("name,position,company,email,department,supervisor")
      .single();

    if (profileError) {
      throw profileError;
    }

    const userPayload = {
      id: req.user.uid,
      name: profileRow.name || req.user.name || "OJT Trainee",
      email: (profileRow.email || req.user.email || "").toLowerCase(),
      username: req.user.username || ((profileRow.email || req.user.email || "").split("@")[0] || `user_${String(req.user.uid).slice(0, 6)}`),
      auth_provider: "google",
      updated_at: now,
    };

    const { error: userUpdateError } = await supabase
      .from("users")
      .upsert(userPayload, { onConflict: "id" });

    if (userUpdateError) {
      throw userUpdateError;
    }

    res.json({
      name: profileRow.name || "OJT Trainee",
      position: profileRow.position || "",
      company: profileRow.company || "",
      email: profileRow.email || "",
      department: profileRow.department || "",
      supervisor: profileRow.supervisor || "",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✓ OJT Tracker API running on 0.0.0.0:${PORT}`);
});
