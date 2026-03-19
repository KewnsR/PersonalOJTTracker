import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Calendar from "react-calendar";
import axios from "axios";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirebaseAuthClient, isFirebaseConfigured } from "./firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "react-calendar/dist/Calendar.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const AUTH_TOKEN_STORAGE_KEY = "ojtAuthToken";
const AUTH_USER_STORAGE_KEY = "ojtAuthUser";

const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromDateString = (dateStr) => {
  const [year, month, day] = (dateStr || "").split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const getStartOfWeek = (date) => {
  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  return value;
};

const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end;
};

export default function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "");
  const [authUser, setAuthUser] = useState(() => {
    const stored = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    username: "",
    name: "",
    identifier: "",
    email: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showLoginSplash, setShowLoginSplash] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({
    date: toLocalDateString(new Date()),
    timeIn: "09:00",
    timeOut: "18:00",
    notes: "",
  });
  const persistEntriesLocally = (nextEntries) => {
    localStorage.setItem("ojtData", JSON.stringify(nextEntries));
  };
  const [timeIn12, setTimeIn12] = useState({ hour: "09", minute: "00", period: "AM" });
  const [timeOut12, setTimeOut12] = useState({ hour: "06", minute: "00", period: "PM" });
  const [profile, setProfile] = useState({
    name: "OJT Trainee",
    position: "",
    company: "",
    email: "",
    department: "",
    supervisor: "",
  });
  const [profileForm, setProfileForm] = useState({
    name: "OJT Trainee",
    position: "",
    company: "",
    email: "",
    department: "",
    supervisor: "",
  });

  const [lunchStart, setLunchStart] = useState(11);
  const [lunchEnd, setLunchEnd] = useState(12);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [requiredOjtHours, setRequiredOjtHours] = useState(600);
  const [goalInput, setGoalInput] = useState("600");
  const [showGoalProgress, setShowGoalProgress] = useState(true);
  const [weeklyJournalNotes, setWeeklyJournalNotes] = useState({});
  const [themeMode, setThemeMode] = useState("dark");
  const [journalFromDate, setJournalFromDate] = useState(() =>
    toLocalDateString(getStartOfWeek(new Date()))
  );
  const [journalToDate, setJournalToDate] = useState(() =>
    toLocalDateString(getEndOfWeek(new Date()))
  );
  const [journalInput, setJournalInput] = useState("");
  const [editingJournalKey, setEditingJournalKey] = useState(null);
  const [journalEditForm, setJournalEditForm] = useState({ from: "", to: "", note: "" });
  const [journalDeleteTarget, setJournalDeleteTarget] = useState(null);
  const [entryDeleteTarget, setEntryDeleteTarget] = useState(null);

  const applyAuthHeader = (token) => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common.Authorization;
    }
  };

  useEffect(() => {
    applyAuthHeader(authToken);
    if (authToken) {
      loadData(authToken);
    } else {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    if (!authUser) return;
    setProfile((prev) => ({
      ...prev,
      name: authUser.name || prev.name,
      email: authUser.email || prev.email,
    }));
    setProfileForm((prev) => ({
      ...prev,
      name: authUser.name || prev.name,
      email: authUser.email || prev.email,
    }));
  }, [authUser]);

  const loadData = async (token = authToken) => {
    try {
      setLoading(true);
      const [entriesRes, prefsRes, profileRes] = await Promise.all([
        axios.get(`${API_URL}/entries`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        axios.get(`${API_URL}/preferences`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        axios.get(`${API_URL}/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
      ]);

      setEntries(entriesRes.data || []);

      const prefs = prefsRes.data || {};
      setLunchStart(prefs.lunchStartHour ?? prefs.lunchStart ?? 11);
      setLunchEnd(prefs.lunchEndHour ?? prefs.lunchEnd ?? 12);
      const hasConfiguredGoal = prefs.requiredOjtHours !== undefined && prefs.requiredOjtHours !== null;
      const savedRequiredHours = prefs.requiredOjtHours ?? 600;
      setRequiredOjtHours(savedRequiredHours);
      setGoalInput(String(savedRequiredHours));
      setShowLoginSplash(!hasConfiguredGoal);
      const savedWeeklyJournal = prefs.weeklyJournalNotes || {};
      setWeeklyJournalNotes(savedWeeklyJournal);
      const savedThemeMode = prefs.themeMode || localStorage.getItem("themeMode") || "dark";
      setThemeMode(savedThemeMode === "light" ? "light" : "dark");

      if (profileRes.data) {
        setProfile(profileRes.data);
        setProfileForm(profileRes.data);
      }
    } catch (loadError) {
      if (loadError?.response?.status === 401) {
        persistAuth("", null);
        setLoading(false);
        return;
      }

      const stored = localStorage.getItem("ojtData");
      const prefs = localStorage.getItem("lunchBreak");
      const goalPrefs = localStorage.getItem("ojtGoal");
      const localWeeklyJournal = localStorage.getItem("weeklyJournalNotes");
      const savedProfile = localStorage.getItem("userProfile");
      const savedThemeMode = localStorage.getItem("themeMode");

      if (stored) setEntries(JSON.parse(stored));
      if (prefs) {
        const p = JSON.parse(prefs);
        setLunchStart(p.start ?? 11);
        setLunchEnd(p.end ?? 12);
      }
      if (goalPrefs) {
        const g = JSON.parse(goalPrefs);
        const savedRequiredHours = Number(g.requiredHours ?? 600);
        setRequiredOjtHours(savedRequiredHours);
        setGoalInput(String(savedRequiredHours));
        setShowGoalProgress(Boolean(g.showGoalProgress ?? true));
      }
      if (localWeeklyJournal) {
        setWeeklyJournalNotes(JSON.parse(localWeeklyJournal));
      }
      if (savedThemeMode) {
        setThemeMode(savedThemeMode === "light" ? "light" : "dark");
      }
      if (!goalPrefs) {
        setShowLoginSplash(true);
      }
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        setProfile(p);
        setProfileForm(p);
      }
    } finally {
      setLoading(false);
    }
  };

  const persistAuth = (token, user) => {
    applyAuthHeader(token || "");
    setAuthToken(token || "");
    setAuthUser(user || null);
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    if (user) {
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setAuthLoading(true);

    try {
      if (authMode === "signup") {
        if (!authForm.username || !authForm.name || !authForm.email || !authForm.password) {
          setError("Please fill in username, full name, email, and password.");
          return;
        }

        const res = await axios.post(`${API_URL}/auth/signup`, {
          username: authForm.username,
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
        });

        persistAuth(res.data?.token, res.data?.user);
      } else {
        if (!authForm.identifier || !authForm.password) {
          setError("Please enter your username/email and password.");
          return;
        }

        const res = await axios.post(`${API_URL}/auth/login`, {
          identifier: authForm.identifier,
          email: authForm.identifier,
          password: authForm.password,
        });

        persistAuth(res.data?.token, res.data?.user);
      }
    } catch (authError) {
      if (!authError?.response) {
        setError("Cannot connect to server. Start backend on http://localhost:5000 and try again.");
        return;
      }

      const message =
        authError?.response?.data?.error ||
        (authMode === "signup" ? "Sign up failed." : "Login failed.");
      if (String(message).toLowerCase().includes("no firestore database exists yet")) {
        setError(
          "Firestore database is not created yet. In Firebase Console, open Firestore Database and create the default database, then retry login/signup."
        );
      } else if (String(message).toLowerCase().includes("cloud firestore api is disabled")) {
        setError(
          "Cloud Firestore API is disabled for your Firebase project. Enable Firestore API in Google Cloud Console and wait a few minutes before retrying login/signup."
        );
      } else {
        setError(message);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      if (!isFirebaseConfigured) {
        setError(
          "Google sign in is not configured. On Vercel, add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in Project Settings > Environment Variables, then redeploy."
        );
        return;
      }

      const firebaseAuth = getFirebaseAuthClient();
      if (!firebaseAuth) {
        setError(
          "Google sign in is not configured. On Vercel, add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in Project Settings > Environment Variables, then redeploy."
        );
        return;
      }

      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(firebaseAuth, provider);
      const firebaseIdToken = await userCredential.user.getIdToken();

      const res = await axios.post(`${API_URL}/auth/google`, {
        firebaseIdToken,
      });

      persistAuth(res.data?.token, res.data?.user);
    } catch (authError) {
      const firebaseCode = authError?.code || "";
      const backendMessage = authError?.response?.data?.error;

      if (backendMessage) {
        if (String(backendMessage).toLowerCase().includes("cloud firestore api is disabled")) {
          setError(
            "Google sign in failed: Cloud Firestore API is disabled for your project. Enable Firestore API in Google Cloud Console, then retry after propagation."
          );
        } else if (String(backendMessage).toLowerCase().includes("no firestore database exists yet")) {
          setError(
            "Google sign in failed: Firestore database is not created yet. Create Firestore Database in Firebase Console, then retry."
          );
        } else {
          setError(`Google sign in failed: ${backendMessage}`);
        }
      } else if (firebaseCode === "auth/operation-not-allowed") {
        setError("Google sign-in is disabled in Firebase Console. Enable Google provider in Authentication > Sign-in method.");
      } else if (firebaseCode === "auth/configuration-not-found") {
        setError(
          "Google sign-in configuration is missing. In Firebase Console > Authentication > Sign-in method, enable Google provider and set a project support email, then retry."
        );
      } else if (firebaseCode === "auth/unauthorized-domain") {
        setError("This domain is not authorized for Firebase Auth. Add localhost to Authentication > Settings > Authorized domains.");
      } else if (firebaseCode === "auth/popup-blocked") {
        setError("Google popup was blocked by the browser. Allow popups and try again.");
      } else if (firebaseCode === "auth/popup-closed-by-user") {
        setError("Google sign-in popup was closed before completing login.");
      } else if (!authError?.response) {
        try {
          await axios.get(`${API_URL}/health`, {
            timeout: 3000,
            validateStatus: () => true,
          });
          setError(
            `Google sign in failed: ${authError?.message || "Network or popup error during Google authentication."}`
          );
        } catch {
          setError("Google sign in failed: backend API is unreachable. Start the server on http://localhost:5000.");
        }
      } else {
        setError(`Google sign in failed: ${firebaseCode || "Unknown error"}`);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const requestLogout = () => {
    setShowProfileDropdown(false);
    setShowLogoutConfirm(true);
  };

  const handleLogout = () => {
    persistAuth("", null);
    setEntries([]);
    setShowProfileDropdown(false);
    setShowLogoutConfirm(false);
    setShowLoginSplash(false);
    setError("");
  };

  const calculateHours = (timeIn, timeOut, lunchStartHour, lunchEndHour) => {
    const [inHour, inMin] = timeIn.split(":").map(Number);
    const [outHour, outMin] = timeOut.split(":").map(Number);

    const start = inHour * 60 + inMin;
    const end = outHour * 60 + outMin;
    if (end <= start) return 0;

    let minutes = end - start;
    const lunchStartMin = lunchStartHour * 60;
    const lunchEndMin = lunchEndHour * 60;

    const overlapStart = Math.max(start, lunchStartMin);
    const overlapEnd = Math.min(end, lunchEndMin);

    if (overlapEnd > overlapStart) {
      minutes -= overlapEnd - overlapStart;
    }

    return Number((minutes / 60).toFixed(2));
  };

  const toTwelveHour = (time24) => {
    const [hRaw = "0", mRaw = "0"] = (time24 || "00:00").split(":");
    const h = Number(hRaw);
    const minute = String(Number(mRaw)).padStart(2, "0");
    const period = h >= 12 ? "PM" : "AM";
    const twelveHour = h % 12 === 0 ? 12 : h % 12;
    return {
      hour: String(twelveHour).padStart(2, "0"),
      minute,
      period,
    };
  };

  const toTwentyFourHour = ({ hour, minute, period }) => {
    let h = Number(hour);
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return `${String(h).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
  };

  const formatTimeDisplay = (time24) => {
    const { hour, minute, period } = toTwelveHour(time24);
    return `${hour}:${minute} ${period}`;
  };

  const getEntryId = (entry) => entry?._id || entry?.id || entry?.date;

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setForm((prev) => ({ ...prev, date: toLocalDateString(date) }));
  };

  const openAddModal = () => {
    setEditingId(null);
    setSelectedDate(new Date());
    setForm({
      date: toLocalDateString(new Date()),
      timeIn: "09:00",
      timeOut: "18:00",
      notes: "",
    });
    setTimeIn12({ hour: "09", minute: "00", period: "AM" });
    setTimeOut12({ hour: "06", minute: "00", period: "PM" });
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingId(null);
  };

  const handleEdit = (entry) => {
    const entryId = getEntryId(entry);
    setEditingId(entryId);
    setForm({
      date: entry.date,
      timeIn: entry.timeIn,
      timeOut: entry.timeOut,
      notes: entry.notes || "",
    });
    setTimeIn12(toTwelveHour(entry.timeIn));
    setTimeOut12(toTwelveHour(entry.timeOut));
    setSelectedDate(fromDateString(entry.date));
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const timeIn24 = toTwentyFourHour(timeIn12);
    const timeOut24 = toTwentyFourHour(timeOut12);

    if (!timeIn24 || !timeOut24) {
      setError("Please enter both Time In and Time Out.");
      return;
    }

    const hours = calculateHours(timeIn24, timeOut24, lunchStart, lunchEnd);
    if (hours <= 0) {
      setError("Time Out must be later than Time In.");
      return;
    }

    const payload = { ...form, timeIn: timeIn24, timeOut: timeOut24, hours };

    try {
      if (editingId) {
        const originalEntry = entries.find((it) => getEntryId(it) === editingId);
        const serverId = originalEntry?._id || originalEntry?.id;

        if (serverId && !String(serverId).startsWith("local-")) {
          const res = await axios.put(
            `${API_URL}/entries/${encodeURIComponent(serverId)}`,
            payload
          );
          setEntries((prev) => {
            const nextEntries = prev.map((it) =>
              getEntryId(it) === editingId ? { ...it, ...res.data } : it
            );
            persistEntriesLocally(nextEntries);
            return nextEntries;
          });
        } else {
          setEntries((prev) => {
            const nextEntries = prev.map((it) =>
              getEntryId(it) === editingId ? { ...it, ...payload } : it
            );
            persistEntriesLocally(nextEntries);
            return nextEntries;
          });
        }
      } else {
        const res = await axios.post(`${API_URL}/entries`, payload);
        setEntries((prev) => {
          const nextEntries = [res.data, ...prev];
          persistEntriesLocally(nextEntries);
          return nextEntries;
        });
      }

      setError("");
      handleCloseModal();
    } catch {
      const offlineEntry = {
        ...payload,
        _id: editingId || `local-${Date.now().toString()}`,
      };
      if (editingId) {
        setEntries((prev) => {
          const nextEntries = prev.map((it) =>
            getEntryId(it) === editingId ? { ...it, ...offlineEntry } : it
          );
          persistEntriesLocally(nextEntries);
          return nextEntries;
        });
      } else {
        setEntries((prev) => {
          const nextEntries = [offlineEntry, ...prev];
          persistEntriesLocally(nextEntries);
          return nextEntries;
        });
      }
      setError("");
      handleCloseModal();
    }
  };

  const handleDelete = async (id) => {
    const entry = typeof id === "object" ? id : entries.find((it) => getEntryId(it) === id);
    const targetId = entry ? getEntryId(entry) : id;
    if (!targetId) return;

    const updated = entries.filter((e) => getEntryId(e) !== targetId);
    setEntries(updated);
    persistEntriesLocally(updated);

    try {
      const serverId = entry?._id || entry?.id;
      if (serverId && !String(serverId).startsWith("local-")) {
        await axios.delete(`${API_URL}/entries/${encodeURIComponent(serverId)}`);
      }
    } catch {
      setError("");
    }
  };

  const requestDeleteEntry = (entry) => {
    setEntryDeleteTarget(entry);
  };

  const confirmDeleteEntry = async () => {
    if (!entryDeleteTarget) return;
    await handleDelete(entryDeleteTarget);
    setEntryDeleteTarget(null);
  };

  const saveLunchSettings = async () => {
    try {
      await axios.put(`${API_URL}/preferences`, {
        lunchStartHour: lunchStart,
        lunchEndHour: lunchEnd,
        themeMode,
      });
      localStorage.setItem("lunchBreak", JSON.stringify({ start: lunchStart, end: lunchEnd }));
      localStorage.setItem("themeMode", themeMode);
      setShowSettings(false);
    } catch {
      localStorage.setItem("lunchBreak", JSON.stringify({ start: lunchStart, end: lunchEnd }));
      localStorage.setItem("themeMode", themeMode);
      setShowSettings(false);
    }
  };

  const saveProfile = async () => {
    try {
      const res = await axios.put(`${API_URL}/profile`, profileForm);
      setProfile(res.data);
      localStorage.setItem("userProfile", JSON.stringify(res.data));
      setShowProfileModal(false);
    } catch {
      setProfile(profileForm);
      localStorage.setItem("userProfile", JSON.stringify(profileForm));
      setShowProfileModal(false);
    }
  };

  const saveGoalSettings = async () => {
    const parsedRequiredHours = Number(goalInput);

    if (!Number.isFinite(parsedRequiredHours) || parsedRequiredHours <= 0) {
      setError("Required OJT hours must be a valid number greater than 0.");
      return;
    }

    try {
      await axios.put(`${API_URL}/preferences`, {
        lunchStartHour: lunchStart,
        lunchEndHour: lunchEnd,
        requiredOjtHours: parsedRequiredHours,
      });
    } catch {
      // Fallback to local persistence only.
    }

    setRequiredOjtHours(parsedRequiredHours);
    localStorage.setItem(
      "ojtGoal",
      JSON.stringify({ requiredHours: parsedRequiredHours, showGoalProgress })
    );
    setError("");
    setShowGoalModal(false);
  };

  const saveInitialGoalSetup = async () => {
    const parsedRequiredHours = Number(goalInput);

    if (!Number.isFinite(parsedRequiredHours) || parsedRequiredHours <= 0) {
      setError("Required OJT hours must be a valid number greater than 0.");
      return;
    }

    try {
      await axios.put(`${API_URL}/preferences`, {
        lunchStartHour: lunchStart,
        lunchEndHour: lunchEnd,
        requiredOjtHours: parsedRequiredHours,
      });
    } catch {
      // local fallback only
    }

    setRequiredOjtHours(parsedRequiredHours);
    setShowGoalProgress(true);
    localStorage.setItem(
      "ojtGoal",
      JSON.stringify({ requiredHours: parsedRequiredHours, showGoalProgress: true })
    );
    setShowLoginSplash(false);
    setError("");
  };

  const initials = useMemo(() => {
    const parts = (profile.name || "OJT Trainee").trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [profile.name]);

  const normalizedEntries = useMemo(() => {
    return entries.map((entry) => {
      const hasTimeRange = typeof entry?.timeIn === "string" && typeof entry?.timeOut === "string";
      const computedHours = hasTimeRange
        ? calculateHours(entry.timeIn, entry.timeOut, lunchStart, lunchEnd)
        : Number(entry?.hours) || 0;

      return {
        ...entry,
        hours: Number.isFinite(computedHours) ? Number(computedHours.toFixed(2)) : 0,
      };
    });
  }, [entries, lunchStart, lunchEnd]);

  const hoursByDate = useMemo(() => {
    return normalizedEntries.reduce((acc, entry) => {
      if (!entry?.date) return acc;
      acc[entry.date] = Number(((acc[entry.date] || 0) + (Number(entry.hours) || 0)).toFixed(2));
      return acc;
    }, {});
  }, [normalizedEntries]);

  const loggedDaysCount = useMemo(() => Object.keys(hoursByDate).length, [hoursByDate]);

  const totalHours = useMemo(
    () => normalizedEntries.reduce((sum, item) => sum + (Number(item.hours) || 0), 0),
    [normalizedEntries]
  );

  const remainingHours = Math.max(0, requiredOjtHours - totalHours);
  const progressPercent =
    requiredOjtHours > 0
      ? Math.min(100, (totalHours / requiredOjtHours) * 100)
      : 0;

  const overallTrendData = useMemo(() => {
    return Object.keys(hoursByDate)
      .sort((a, b) => a.localeCompare(b))
      .map((dateStr) => ({
        date: dateStr,
        name: fromDateString(dateStr).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        hours: Number((hoursByDate[dateStr] || 0).toFixed(2)),
      }));
  }, [hoursByDate]);

  const averageDailyHours = useMemo(() => {
    if (!loggedDaysCount) return 0;
    return totalHours / loggedDaysCount;
  }, [totalHours, loggedDaysCount]);

  const sortedEntries = useMemo(() => {
    return [...normalizedEntries].sort((a, b) => {
      const byDate = (b?.date || "").localeCompare(a?.date || "");
      if (byDate !== 0) return byDate;
      return (b?.timeIn || "").localeCompare(a?.timeIn || "");
    });
  }, [normalizedEntries]);

  const selectedDateEntries = useMemo(() => {
    const selectedDateStr = toLocalDateString(selectedDate);
    return sortedEntries.filter((entry) => entry.date === selectedDateStr);
  }, [sortedEntries, selectedDate]);

  const currentWeekKey = useMemo(
    () => `${journalFromDate}__${journalToDate}`,
    [journalFromDate, journalToDate]
  );
  const currentWeekLabel = useMemo(() => {
    const fromLabel = fromDateString(journalFromDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const toLabel = fromDateString(journalToDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${fromLabel} - ${toLabel}`;
  }, [journalFromDate, journalToDate]);

  const weeklyJournalHistory = useMemo(() => {
    return Object.entries(weeklyJournalNotes)
      .map(([key, note]) => {
        const [from = "", to = ""] = key.split("__");
        return {
          key,
          from,
          to,
          note: (note || "").trim(),
        };
      })
      .filter((item) => item.note.length > 0)
      .sort((a, b) => b.from.localeCompare(a.from));
  }, [weeklyJournalNotes]);

  useEffect(() => {
    setJournalInput(weeklyJournalNotes[currentWeekKey] || "");
  }, [currentWeekKey, weeklyJournalNotes]);

  const persistWeeklyJournalNotes = async (nextJournalNotes) => {
    try {
      await axios.put(`${API_URL}/preferences`, {
        weeklyJournalNotes: nextJournalNotes,
      });
    } catch {
      // local fallback only
    }

    setWeeklyJournalNotes(nextJournalNotes);
    localStorage.setItem("weeklyJournalNotes", JSON.stringify(nextJournalNotes));
  };

  const saveWeeklyJournal = async () => {
    const nextJournalNotes = {
      ...weeklyJournalNotes,
      [currentWeekKey]: journalInput.trim(),
    };

    await persistWeeklyJournalNotes(nextJournalNotes);
    setError("");
  };

  const startEditWeeklyJournalFromHistory = (item) => {
    setEditingJournalKey(item.key);
    setJournalEditForm({ from: item.from, to: item.to, note: item.note });
  };

  const cancelEditWeeklyJournalFromHistory = () => {
    setEditingJournalKey(null);
    setJournalEditForm({ from: "", to: "", note: "" });
  };

  const saveEditedWeeklyJournalFromHistory = async () => {
    const nextFrom = journalEditForm.from;
    const nextTo = journalEditForm.to;
    const trimmedNote = journalEditForm.note.trim();

    if (!nextFrom || !nextTo) {
      setError("Please set both Date From and Date To for weekly journal.");
      return;
    }

    const normalizedFrom = nextFrom <= nextTo ? nextFrom : nextTo;
    const normalizedTo = nextFrom <= nextTo ? nextTo : nextFrom;
    const nextKey = `${normalizedFrom}__${normalizedTo}`;

    const nextJournalNotes = { ...weeklyJournalNotes };
    if (editingJournalKey) {
      delete nextJournalNotes[editingJournalKey];
    }
    if (trimmedNote) {
      nextJournalNotes[nextKey] = trimmedNote;
    }

    await persistWeeklyJournalNotes(nextJournalNotes);
    setEditingJournalKey(null);
    setJournalEditForm({ from: "", to: "", note: "" });
    setError("");
  };

  const requestDeleteWeeklyJournalFromHistory = (item) => {
    setJournalDeleteTarget(item);
  };

  const confirmDeleteWeeklyJournalFromHistory = async () => {
    if (!journalDeleteTarget?.key) return;

    const nextJournalNotes = { ...weeklyJournalNotes };
    delete nextJournalNotes[journalDeleteTarget.key];
    await persistWeeklyJournalNotes(nextJournalNotes);
    setJournalDeleteTarget(null);
    setError("");
  };

  const shiftJournalRangeByDays = (days) => {
    const from = fromDateString(journalFromDate);
    const to = fromDateString(journalToDate);
    from.setDate(from.getDate() + days);
    to.setDate(to.getDate() + days);
    setJournalFromDate(toLocalDateString(from));
    setJournalToDate(toLocalDateString(to));
  };

  const setJournalToCurrentWeek = () => {
    const today = new Date();
    setJournalFromDate(toLocalDateString(getStartOfWeek(today)));
    setJournalToDate(toLocalDateString(getEndOfWeek(today)));
  };

  if (!authToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 p-4 md:p-8">
        <div className="mx-auto flex min-h-[85vh] max-w-md items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h1 className="text-3xl font-black text-blue-600">OJT Tracker</h1>
            <p className="mt-2 text-sm text-slate-600">
              {authMode === "signup"
                ? "Create an account to start tracking your OJT hours."
                : "Sign in using username/email or continue with Google."}
            </p>

            {error ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleAuthSubmit} className="mt-5 space-y-3">
              {authMode === "signup" ? (
                <>
                  <input
                    type="text"
                    value={authForm.username}
                    onChange={(e) =>
                      setAuthForm((prev) => ({ ...prev, username: e.target.value }))
                    }
                    placeholder="Username"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400"
                  />
                  <input
                    type="text"
                    value={authForm.name}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Full Name"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400"
                  />
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Email"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400"
                  />
                </>
              ) : (
                <input
                  type="text"
                  value={authForm.identifier}
                  onChange={(e) =>
                    setAuthForm((prev) => ({ ...prev, identifier: e.target.value }))
                  }
                  placeholder="Username or Email"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400"
                />
              )}

              <div className="relative">
                <input
                  type={showAuthPassword ? "text" : "password"}
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-12 text-slate-900 placeholder-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowAuthPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label={showAuthPassword ? "Hide password" : "Show password"}
                  title={showAuthPassword ? "Hide password" : "Show password"}
                >
                  {showAuthPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58a2 2 0 102.83 2.83" />
                      <path d="M16.68 16.67A10.94 10.94 0 0112 18C7 18 3 12 3 12a21.77 21.77 0 014.22-4.94" />
                      <path d="M9.88 5.09A10.94 10.94 0 0112 5c5 0 9 7 9 7a21.83 21.83 0 01-1.67 2.68" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {authLoading
                  ? authMode === "signup"
                    ? "Creating account..."
                    : "Signing in..."
                  : authMode === "signup"
                    ? "Create Account"
                    : "Sign In"}
              </button>
            </form>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {googleLoading ? "Connecting to Google..." : "Continue with Google"}
            </button>

            <button
              type="button"
              onClick={() => {
                setError("");
                setAuthMode((prev) => (prev === "login" ? "signup" : "login"));
              }}
              className="mt-4 w-full text-sm text-blue-600 hover:text-blue-700"
            >
              {authMode === "signup"
                ? "Already have an account? Sign in"
                : "No account yet? Sign up"}
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        themeMode === "light"
          ? "bg-gradient-to-br from-slate-100 via-white to-slate-100"
          : "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
      }`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-300/20 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
          <p className={themeMode === "light" ? "text-slate-700" : "text-slate-300"}>
            Loading your OJT dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme={themeMode}
      className={`min-h-screen p-4 md:p-8 ${
        themeMode === "light"
          ? "bg-gradient-to-br from-slate-100 via-white to-slate-100"
          : "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-7xl"
      >
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-blue-600">
              OJT Dashboard
            </h1>
            <p className={themeMode === "light" ? "mt-2 text-slate-600" : "mt-2 text-slate-300"}>
              Clean tracking for your daily training hours.
            </p>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProfileDropdown((s) => !s)}
              className={`flex items-center gap-3 rounded-full px-2 py-2 text-left shadow ${
                themeMode === "light"
                  ? "border border-slate-300 bg-white hover:border-blue-400"
                  : "border border-slate-700 bg-slate-800 hover:border-cyan-400/50"
              }`}
            >
              <div className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white font-bold">
                {initials}
              </div>
              <div className="hidden sm:block pr-3">
                <div className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  {profile.name}
                </div>
                <div className={`text-xs ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                  {profile.position || "OJT Trainee"}
                </div>
              </div>
            </button>

            {showProfileDropdown && (
              <div
                className={`absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl shadow-2xl ${
                  themeMode === "light"
                    ? "border border-slate-200 bg-white"
                    : "border border-slate-700 bg-slate-900"
                }`}
              >
                <div className="bg-blue-600 p-5 text-white">
                  <div className="font-semibold text-lg">{profile.name}</div>
                  <div className="text-sm text-white/90">{profile.position || "OJT Trainee"}</div>
                </div>
                <div className={`space-y-2 p-4 text-sm ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                  {profile.company ? <p><span className={themeMode === "light" ? "text-slate-500" : "text-slate-400"}>Company:</span> {profile.company}</p> : null}
                  {profile.department ? <p><span className={themeMode === "light" ? "text-slate-500" : "text-slate-400"}>Department:</span> {profile.department}</p> : null}
                  {profile.email ? <p><span className={themeMode === "light" ? "text-slate-500" : "text-slate-400"}>Email:</span> {profile.email}</p> : null}
                </div>
                <div className={`flex gap-2 p-4 ${themeMode === "light" ? "border-t border-slate-200" : "border-t border-slate-800"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      setShowProfileModal(true);
                    }}
                    className="flex-1 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileDropdown(false);
                      setShowSettings(true);
                    }}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Settings
                  </button>
                </div>
                <div className={`px-4 pb-4 ${themeMode === "light" ? "border-t border-slate-200" : "border-t border-slate-800"}`}>
                  <button
                    type="button"
                    onClick={requestLogout}
                    className={
                      themeMode === "light"
                        ? "mt-3 w-full rounded-lg bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-200"
                        : "mt-3 w-full rounded-lg bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/30"
                    }
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200">
            {error}
          </div>
        ) : null}

        <div
          className={`mb-6 inline-flex rounded-lg p-1 ${
            themeMode === "light" ? "border border-slate-300 bg-white" : "border border-slate-700 bg-slate-900"
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTab("dashboard")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === "dashboard"
                ? "bg-cyan-500 text-slate-950"
                : themeMode === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === "calendar"
                ? "bg-cyan-500 text-slate-950"
                : themeMode === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("journal")}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
              activeTab === "journal"
                ? "bg-cyan-500 text-slate-950"
                : themeMode === "light"
                  ? "text-slate-700 hover:bg-slate-100"
                  : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Weekly Report
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGoalModal(true)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              themeMode === "light"
                ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            Set Required OJT Hours
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !showGoalProgress;
              setShowGoalProgress(next);
              localStorage.setItem(
                "ojtGoal",
                JSON.stringify({ requiredHours: requiredOjtHours, showGoalProgress: next })
              );
            }}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              themeMode === "light"
                ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                : "border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            {showGoalProgress ? "Hide OJT Goal" : "Show OJT Goal"}
          </button>
        </div>

        {showGoalProgress && (
          <div
            className={`mb-6 rounded-xl p-4 shadow ${
              themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={themeMode === "light" ? "text-sm text-slate-500" : "text-sm text-slate-400"}>Required OJT Hours</p>
                <p className={themeMode === "light" ? "text-2xl font-bold text-slate-900" : "text-2xl font-bold text-slate-100"}>{requiredOjtHours.toFixed(2)}h</p>
              </div>
              <div>
                <p className={themeMode === "light" ? "text-sm text-slate-500" : "text-sm text-slate-400"}>Completed</p>
                <p className={themeMode === "light" ? "text-2xl font-bold text-sky-600" : "text-2xl font-bold text-cyan-300"}>{totalHours.toFixed(2)}h</p>
              </div>
              <div>
                <p className={themeMode === "light" ? "text-sm text-slate-500" : "text-sm text-slate-400"}>Remaining</p>
                <p className={themeMode === "light" ? "text-2xl font-bold text-amber-600" : "text-2xl font-bold text-amber-300"}>{remainingHours.toFixed(2)}h</p>
              </div>
            </div>
            <div className="mt-4">
              <div className={`mb-1 flex items-center justify-between text-xs ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>
                <span>Progress</span>
                <span>{progressPercent.toFixed(1)}%</span>
              </div>
              <div className={`h-2 w-full rounded-full ${themeMode === "light" ? "bg-slate-200" : "bg-slate-800"}`}>
                <div
                  className="h-2 rounded-full bg-cyan-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "dashboard" && (
          <>
            <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Hours", value: `${totalHours.toFixed(2)}h` },
            { label: "Entries", value: `${normalizedEntries.length}` },
            {
              label: "Avg Daily",
              value: `${averageDailyHours.toFixed(2)}h`,
            },
            {
              label: "Logged Days",
              value: `${loggedDaysCount}`,
            },
          ].map((item) => (
            <motion.div
              key={item.label}
              whileHover={{ y: -3 }}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow transition-shadow hover:shadow-lg"
            >
              <div className="text-sm text-slate-400">{item.label}</div>
              <div className="text-3xl font-bold text-slate-100">{item.value}</div>
            </motion.div>
          ))}
            </div>

            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow transition-shadow hover:shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-slate-100">Overall Hours Trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={overallTrendData}>
              <XAxis dataKey="name" stroke="#94A3B8" />
              <YAxis stroke="#94A3B8" />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "10px",
                  color: "#e2e8f0",
                }}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#22d3ee"
                strokeWidth={3}
                dot={{ fill: "#22d3ee", r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
            </div>

            <button
          type="button"
          onClick={openAddModal}
          className="mb-8 w-full rounded-xl bg-cyan-500 px-4 py-3 text-lg font-bold text-slate-950 shadow hover:bg-cyan-400"
        >
          + Add New Entry
            </button>

            <div
              className={`overflow-hidden rounded-2xl shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-800 bg-slate-900"
              } transition-shadow hover:shadow-lg`}
            >
          <div className={`px-6 py-4 ${themeMode === "light" ? "border-b border-slate-200" : "border-b border-slate-800"}`}>
            <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
              OJT Entries
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={themeMode === "light" ? "bg-slate-100 text-slate-700" : "bg-slate-800/70 text-slate-200"}>
                <tr>
                  <th className="p-4 text-left">Date</th>
                  <th className="p-4 text-left">In</th>
                  <th className="p-4 text-left">Out</th>
                  <th className="p-4 text-left">Hours</th>
                  <th className="p-4 text-left">Notes</th>
                  <th className="p-4 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td className="p-8 text-center text-slate-400" colSpan="6">
                      No entries yet. Add your first one.
                    </td>
                  </tr>
                ) : (
                  sortedEntries.map((entry) => (
                    <tr
                      key={getEntryId(entry)}
                      className={
                        themeMode === "light"
                          ? "border-t border-slate-200 hover:bg-slate-50"
                          : "border-t border-slate-800 hover:bg-slate-800/40"
                      }
                    >
                      <td className={`p-4 ${themeMode === "light" ? "text-slate-700" : "text-slate-200"}`}>{entry.date}</td>
                      <td className={`p-4 ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>{formatTimeDisplay(entry.timeIn)}</td>
                      <td className={`p-4 ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>{formatTimeDisplay(entry.timeOut)}</td>
                      <td className={`p-4 font-semibold ${themeMode === "light" ? "text-blue-600" : "text-cyan-300"}`}>
                        {Number(entry.hours || 0).toFixed(2)}h
                      </td>
                      <td className={`max-w-xs truncate p-4 ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                        {entry.notes || "-"}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(entry)}
                            className={
                              themeMode === "light"
                                ? "rounded-md bg-blue-100 px-2 py-1 text-blue-700 hover:bg-blue-200"
                                : "rounded-md bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteEntry(entry)}
                            className={
                              themeMode === "light"
                                ? "rounded-md bg-rose-100 px-2 py-1 text-rose-700 hover:bg-rose-200"
                                : "rounded-md bg-rose-500/20 px-2 py-1 text-rose-300 hover:bg-rose-500/30"
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
            </div>
          </>
        )}

        {activeTab === "calendar" && (
          <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
            <div className={`rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"}`}>
              <h3 className={`mb-4 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Training Calendar</h3>
              <div className={`calendar-wrapper calendar-wrapper--large rounded-xl p-3 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800"}`}>
                <Calendar
                  value={selectedDate}
                  onChange={handleDateSelect}
                  maxDate={new Date()}
                />
              </div>
              <button
                type="button"
                onClick={openAddModal}
                className="mt-4 w-full rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Add Entry for Selected Date
              </button>
            </div>

            <div className={`rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"}`}>
              <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Entries on {toLocalDateString(selectedDate)}</h3>
              <div className="mt-4 space-y-3">
                {selectedDateEntries.length === 0 ? (
                  <p className={themeMode === "light" ? "text-slate-500" : "text-slate-400"}>No entries for this date.</p>
                ) : (
                  selectedDateEntries.map((entry) => (
                    <div
                      key={getEntryId(entry)}
                      className={`rounded-lg p-4 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800"}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                          {formatTimeDisplay(entry.timeIn)} - {formatTimeDisplay(entry.timeOut)}
                        </p>
                        <p className={`font-semibold ${themeMode === "light" ? "text-sky-600" : "text-cyan-300"}`}>{Number(entry.hours || 0).toFixed(2)}h</p>
                      </div>
                      <p className={`mt-1 text-sm ${themeMode === "light" ? "text-slate-500" : "text-slate-400"}`}>{entry.notes || "No notes"}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(entry)}
                          className="rounded-md bg-cyan-500/20 px-2 py-1 text-cyan-300 hover:bg-cyan-500/30"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteEntry(entry)}
                          className="rounded-md bg-rose-500/20 px-2 py-1 text-rose-300 hover:bg-rose-500/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "journal" && (
          <div
            className={`rounded-2xl p-6 shadow ${
              themeMode === "light"
                ? "border border-slate-200 bg-white"
                : "border border-slate-800 bg-slate-900"
            }`}
          >
            <div
              className={`mb-8 rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-slate-50"
                  : "border border-slate-700 bg-slate-800/40"
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  Weekly Report
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shiftJournalRangeByDays(-7)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={setJournalToCurrentWeek}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    This Week
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftJournalRangeByDays(7)}
                    className={`rounded-md px-3 py-1 text-sm font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>

              <p className={`mb-3 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Week: {currentWeekLabel}
              </p>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <div>
                  <label className={`mb-1 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Date From
                  </label>
                  <input
                    type="date"
                    value={journalFromDate}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setJournalFromDate(nextFrom);
                      if (nextFrom > journalToDate) {
                        setJournalToDate(nextFrom);
                      }
                    }}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  />
                </div>
                <div>
                  <label className={`mb-1 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Date To
                  </label>
                  <input
                    type="date"
                    value={journalToDate}
                    onChange={(e) => {
                      const nextTo = e.target.value;
                      setJournalToDate(nextTo);
                      if (nextTo < journalFromDate) {
                        setJournalFromDate(nextTo);
                      }
                    }}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  />
                </div>
              </div>
              <textarea
                value={journalInput}
                onChange={(e) => setJournalInput(e.target.value)}
                placeholder="Write your weekly accomplishments, blockers, and plans..."
                rows={6}
                className={`w-full rounded-lg px-3 py-2 placeholder-slate-500 ${
                  themeMode === "light"
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={saveWeeklyJournal}
                  className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Weekly Report
                </button>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Saved Weekly Reports
              </h3>
              <span className={`text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                {weeklyJournalHistory.length} saved
              </span>
            </div>

            {weeklyJournalHistory.length === 0 ? (
              <p className={themeMode === "light" ? "text-slate-600" : "text-slate-400"}>
                No weekly reports saved yet. Use Save Weekly Journal above.
              </p>
            ) : (
              <div className="space-y-3">
                {weeklyJournalHistory.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-xl p-4 ${
                      themeMode === "light"
                        ? "border border-slate-200 bg-slate-50"
                        : "border border-slate-700 bg-slate-800"
                    }`}
                  >
                    {editingJournalKey === item.key ? (
                      <div className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <label className={`mb-1 block text-xs font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                              Date From
                            </label>
                            <input
                              type="date"
                              value={journalEditForm.from}
                              onChange={(e) => setJournalEditForm((prev) => ({ ...prev, from: e.target.value }))}
                              className={`w-full rounded-lg px-2 py-2 text-sm ${
                                themeMode === "light"
                                  ? "border border-slate-300 bg-white text-slate-900"
                                  : "border border-slate-700 bg-slate-800 text-slate-100"
                              }`}
                            />
                          </div>
                          <div>
                            <label className={`mb-1 block text-xs font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                              Date To
                            </label>
                            <input
                              type="date"
                              value={journalEditForm.to}
                              onChange={(e) => setJournalEditForm((prev) => ({ ...prev, to: e.target.value }))}
                              className={`w-full rounded-lg px-2 py-2 text-sm ${
                                themeMode === "light"
                                  ? "border border-slate-300 bg-white text-slate-900"
                                  : "border border-slate-700 bg-slate-800 text-slate-100"
                              }`}
                            />
                          </div>
                        </div>
                        <textarea
                          value={journalEditForm.note}
                          onChange={(e) => setJournalEditForm((prev) => ({ ...prev, note: e.target.value }))}
                          rows={4}
                          className={`w-full rounded-lg px-3 py-2 text-sm ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEditWeeklyJournalFromHistory}
                            className={
                              themeMode === "light"
                                ? "rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                : "rounded-md bg-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-600"
                            }
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEditedWeeklyJournalFromHistory}
                            className="rounded-md bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                            {item.from} to {item.to}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEditWeeklyJournalFromHistory(item)}
                              className={
                                themeMode === "light"
                                  ? "rounded-md bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                                  : "rounded-md bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/30"
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDeleteWeeklyJournalFromHistory(item)}
                              className={
                                themeMode === "light"
                                  ? "rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                  : "rounded-md bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/30"
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <p className={`whitespace-pre-wrap text-sm ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                          {item.note}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {journalDeleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setJournalDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`mb-2 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Delete Weekly Journal
              </h3>
              <p className={`mb-4 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Are you sure you want to delete this journal entry for
                <span className={`ml-1 font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                  {journalDeleteTarget.from} to {journalDeleteTarget.to}
                </span>
                ?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setJournalDeleteTarget(null)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteWeeklyJournalFromHistory}
                  className="flex-1 rounded-lg bg-rose-500 py-2 font-semibold text-white hover:bg-rose-600"
                >
                  Delete
                </button>
              </div>
            </motion.div>

            <footer className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center">
              <p
                className={
                  themeMode === "light"
                    ? "rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs text-slate-600 shadow"
                    : "rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1 text-xs text-slate-300 shadow"
                }
              >
                Version 1.0
              </p>
            </footer>
          </div>
        )}

        {entryDeleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setEntryDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`mb-2 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Delete OJT Entry
              </h3>
              <p className={`mb-2 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Are you sure you want to delete this entry?
              </p>
              <p className={`mb-4 text-sm font-semibold ${themeMode === "light" ? "text-slate-800" : "text-slate-200"}`}>
                {entryDeleteTarget.date} • {formatTimeDisplay(entryDeleteTarget.timeIn)} - {formatTimeDisplay(entryDeleteTarget.timeOut)}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEntryDeleteTarget(null)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteEntry}
                  className="flex-1 rounded-lg bg-rose-500 py-2 font-semibold text-white hover:bg-rose-600"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={handleCloseModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-2xl rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h2 className={`mb-4 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                {editingId ? "Edit Entry" : "Add Entry"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Date</label>
                    <div className={`calendar-wrapper rounded-xl p-3 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800/60"}`}>
                      <Calendar
                        value={selectedDate}
                        onChange={handleDateSelect}
                        maxDate={new Date()}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Time In</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={timeIn12.hour}
                          onChange={(e) => setTimeIn12((prev) => ({ ...prev, hour: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const hourValue = String(i + 1).padStart(2, "0");
                            return (
                              <option key={hourValue} value={hourValue}>
                                {hourValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeIn12.minute}
                          onChange={(e) => setTimeIn12((prev) => ({ ...prev, minute: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 60 }, (_, i) => {
                            const minuteValue = String(i).padStart(2, "0");
                            return (
                              <option key={minuteValue} value={minuteValue}>
                                {minuteValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeIn12.period}
                          onChange={(e) => setTimeIn12((prev) => ({ ...prev, period: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Time Out</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          value={timeOut12.hour}
                          onChange={(e) => setTimeOut12((prev) => ({ ...prev, hour: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const hourValue = String(i + 1).padStart(2, "0");
                            return (
                              <option key={hourValue} value={hourValue}>
                                {hourValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeOut12.minute}
                          onChange={(e) => setTimeOut12((prev) => ({ ...prev, minute: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          {Array.from({ length: 60 }, (_, i) => {
                            const minuteValue = String(i).padStart(2, "0");
                            return (
                              <option key={minuteValue} value={minuteValue}>
                                {minuteValue}
                              </option>
                            );
                          })}
                        </select>
                        <select
                          value={timeOut12.period}
                          onChange={(e) => setTimeOut12((prev) => ({ ...prev, period: e.target.value }))}
                          className={`w-full rounded-lg px-2 py-2 ${
                            themeMode === "light"
                              ? "border border-slate-300 bg-white text-slate-900"
                              : "border border-slate-700 bg-slate-800 text-slate-100"
                          }`}
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Notes</label>
                      <input
                        type="text"
                        value={form.notes}
                        onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Optional notes"
                        className={`w-full rounded-lg px-3 py-2 placeholder-slate-500 ${
                          themeMode === "light"
                            ? "border border-slate-300 bg-white text-slate-900"
                            : "border border-slate-700 bg-slate-800 text-slate-100"
                        }`}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className={`flex-1 rounded-lg py-2 font-semibold ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                  >
                    {editingId ? "Update Entry" : "Add Entry"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showSettings && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`settings-modal w-full max-w-md rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-300 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h2 className={`mb-5 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Lunch Break Settings
              </h2>
              <div className="space-y-4">
                <div>
                  <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Start Hour
                  </label>
                  <select
                    value={lunchStart}
                    onChange={(e) => setLunchStart(Number(e.target.value))}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    End Hour
                  </label>
                  <select
                    value={lunchEnd}
                    onChange={(e) => setLunchEnd(Number(e.target.value))}
                    className={`w-full rounded-lg px-3 py-2 ${
                      themeMode === "light"
                        ? "border border-slate-300 bg-white text-slate-900"
                        : "border border-slate-700 bg-slate-800 text-slate-100"
                    }`}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {String(i).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                    Theme
                  </label>
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100"
                      : "border border-slate-700 bg-slate-800"
                  }`}>
                    <span className={`text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-200"}`}>
                      {themeMode === "dark" ? "Dark Mode" : "Light Mode"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={themeMode === "dark"}
                      aria-label="Toggle theme mode"
                      onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                      className={`theme-switch ${themeMode === "dark" ? "theme-switch--dark" : "theme-switch--light"}`}
                    >
                      <span className="theme-switch__icon theme-switch__icon--sun">☀</span>
                      <span className="theme-switch__icon theme-switch__icon--moon">☾</span>
                      <span className="theme-switch__thumb" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveLunchSettings}
                  className="flex-1 rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showProfileModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowProfileModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-lg rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-700 bg-slate-900"}`}
            >
              <h2 className={`mb-5 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Edit Profile</h2>
              <div className="space-y-3">
                {[
                  ["name", "Full Name"],
                  ["position", "Position"],
                  ["company", "Company"],
                  ["department", "Department"],
                  ["email", "Email"],
                  ["supervisor", "Supervisor"],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className={`mb-1 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>{label}</label>
                    <input
                      type={key === "email" ? "email" : "text"}
                      value={profileForm[key] || ""}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className={`w-full rounded-lg px-3 py-2 ${
                        themeMode === "light"
                          ? "border border-slate-300 bg-white text-slate-900"
                          : "border border-slate-700 bg-slate-800 text-slate-100"
                      }`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfile}
                  className="flex-1 rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Profile
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showGoalModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowGoalModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-700 bg-slate-900"}`}
            >
              <h2 className={`mb-2 text-2xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>OJT Required Hours</h2>
              <p className={`mb-4 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Set how many total hours you need to complete your OJT.
              </p>
              <label className={`mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>Required Hours</label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 ${
                  themeMode === "light"
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              />
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowGoalModal(false)}
                  className={`flex-1 rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveGoalSettings}
                  className="flex-1 rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  Save Goal
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showLoginSplash && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`text-2xl font-black ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Setup Your OJT Goal
              </h3>
              <p className={`mt-3 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-300"}`}>
                Hi {profile.name || authUser?.name || "Trainee"}, set how many total OJT hours you need (example: 500 or 600).
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {[500, 600, 700].map((hoursPreset) => (
                  <button
                    key={hoursPreset}
                    type="button"
                    onClick={() => setGoalInput(String(hoursPreset))}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      Number(goalInput) === hoursPreset
                        ? "bg-cyan-500 text-slate-950"
                        : themeMode === "light"
                          ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                          : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {hoursPreset}h
                  </button>
                ))}
              </div>

              <label className={`mt-4 mb-2 block text-sm font-semibold ${themeMode === "light" ? "text-slate-700" : "text-slate-300"}`}>
                Required OJT Hours
              </label>
              <input
                type="number"
                min="1"
                step="0.5"
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 ${
                  themeMode === "light"
                    ? "border border-slate-300 bg-white text-slate-900"
                    : "border border-slate-700 bg-slate-800 text-slate-100"
                }`}
              />

              <button
                type="button"
                onClick={saveInitialGoalSetup}
                className="mt-5 w-full rounded-lg bg-cyan-500 py-2 font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Save and Continue
              </button>
            </motion.div>
          </div>
        )}

        {showLogoutConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-sm rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-700 bg-slate-900"
              }`}
            >
              <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                Logout Confirmation
              </h3>
              <p className={`mt-2 text-sm ${themeMode === "light" ? "text-slate-600" : "text-slate-400"}`}>
                Are you sure you want to logout?
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className={`rounded-lg py-2 font-semibold ${
                    themeMode === "light"
                      ? "border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg bg-rose-500 py-2 font-semibold text-white hover:bg-rose-600"
                >
                  Yes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>

    </div>
  );
}
