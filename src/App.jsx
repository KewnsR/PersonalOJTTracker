import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Calendar from "react-calendar";
import axios from "axios";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "react-calendar/dist/Calendar.css";

const API_URL = "http://localhost:5000/api";

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [entriesRes, prefsRes, profileRes] = await Promise.all([
        axios.get(`${API_URL}/entries`),
        axios.get(`${API_URL}/preferences`),
        axios.get(`${API_URL}/profile`),
      ]);

      setEntries(entriesRes.data || []);

      const prefs = prefsRes.data || {};
      setLunchStart(prefs.lunchStartHour ?? prefs.lunchStart ?? 11);
      setLunchEnd(prefs.lunchEndHour ?? prefs.lunchEnd ?? 12);
      const savedRequiredHours = prefs.requiredOjtHours ?? 600;
      setRequiredOjtHours(savedRequiredHours);
      setGoalInput(String(savedRequiredHours));
      const savedWeeklyJournal = prefs.weeklyJournalNotes || {};
      setWeeklyJournalNotes(savedWeeklyJournal);
      const savedThemeMode = prefs.themeMode || localStorage.getItem("themeMode") || "dark";
      setThemeMode(savedThemeMode === "light" ? "light" : "dark");

      if (profileRes.data) {
        setProfile(profileRes.data);
        setProfileForm(profileRes.data);
      }
    } catch {
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
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        setProfile(p);
        setProfileForm(p);
      }
    } finally {
      setLoading(false);
    }
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
    if (!window.confirm("Delete this entry?")) return;

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

  const initials = useMemo(() => {
    const parts = (profile.name || "OJT Trainee").trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [profile.name]);

  const totalHours = useMemo(
    () => entries.reduce((sum, item) => sum + (Number(item.hours) || 0), 0),
    [entries]
  );

  const remainingHours = Math.max(0, requiredOjtHours - totalHours);
  const progressPercent =
    requiredOjtHours > 0
      ? Math.min(100, (totalHours / requiredOjtHours) * 100)
      : 0;

  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const d = new Date();
      d.setDate(d.getDate() - index);
      const dateStr = toLocalDateString(d);
      const sum = entries
        .filter((e) => e.date === dateStr)
        .reduce((acc, cur) => acc + (Number(cur.hours) || 0), 0);

      return {
        name: fromDateString(dateStr).toLocaleDateString("en-US", { weekday: "short" }),
        hours: Number(sum.toFixed(2)),
      };
    }).reverse();
  }, [entries]);

  const selectedDateEntries = useMemo(() => {
    const selectedDateStr = toLocalDateString(selectedDate);
    return entries.filter((entry) => entry.date === selectedDateStr);
  }, [entries, selectedDate]);

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

  useEffect(() => {
    setJournalInput(weeklyJournalNotes[currentWeekKey] || "");
  }, [currentWeekKey, weeklyJournalNotes]);

  const saveWeeklyJournal = async () => {
    const nextJournalNotes = {
      ...weeklyJournalNotes,
      [currentWeekKey]: journalInput.trim(),
    };

    try {
      await axios.put(`${API_URL}/preferences`, {
        weeklyJournalNotes: nextJournalNotes,
      });
    } catch {
      // local fallback only
    }

    setWeeklyJournalNotes(nextJournalNotes);
    localStorage.setItem("weeklyJournalNotes", JSON.stringify(nextJournalNotes));
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
            { label: "Entries", value: `${entries.length}` },
            {
              label: "Avg Daily",
              value: `${entries.length ? (totalHours / entries.length).toFixed(2) : "0.00"}h`,
            },
            {
              label: "This Week",
              value: `${weekData.reduce((s, d) => s + d.hours, 0).toFixed(2)}h`,
            },
          ].map((item) => (
            <motion.div
              key={item.label}
              whileHover={{ y: -3 }}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow"
            >
              <div className="text-sm text-slate-400">{item.label}</div>
              <div className="text-3xl font-bold text-slate-100">{item.value}</div>
            </motion.div>
          ))}
            </div>

            <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow">
          <h3 className="mb-4 text-xl font-bold text-slate-100">Weekly Hours</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={weekData}>
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

            <div
              className={`mb-8 rounded-2xl p-6 shadow ${
                themeMode === "light"
                  ? "border border-slate-200 bg-white"
                  : "border border-slate-800 bg-slate-900"
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className={`text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>
                  Weekly Journal
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
                  Save Weekly Journal
                </button>
              </div>
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
              }`}
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
                {entries.length === 0 ? (
                  <tr>
                    <td className="p-8 text-center text-slate-400" colSpan="6">
                      No entries yet. Add your first one.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
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
                            onClick={() => handleDelete(entry)}
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
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={`rounded-2xl p-6 shadow ${themeMode === "light" ? "border border-slate-200 bg-white" : "border border-slate-800 bg-slate-900"}`}>
              <h3 className={`mb-4 text-xl font-bold ${themeMode === "light" ? "text-slate-900" : "text-slate-100"}`}>Training Calendar</h3>
              <div className={`calendar-wrapper rounded-xl p-3 ${themeMode === "light" ? "border border-slate-200 bg-slate-50" : "border border-slate-700 bg-slate-800"}`}>
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
                          onClick={() => handleDelete(entry)}
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
      </motion.div>

      <style>{`
        [data-theme='light'] .text-slate-100 {
          color: #0f172a !important;
        }
        [data-theme='light'] .text-slate-200,
        [data-theme='light'] .text-slate-300 {
          color: #334155 !important;
        }
        [data-theme='light'] .text-slate-400 {
          color: #64748b !important;
        }
        [data-theme='light'] .text-cyan-300 {
          color: #0369a1 !important;
        }
        [data-theme='light'] .text-amber-300 {
          color: #a16207 !important;
        }
        [data-theme='light'] .text-rose-200 {
          color: #b91c1c !important;
        }
        [data-theme='light'] .bg-slate-900 {
          background-color: #ffffff !important;
        }
        [data-theme='light'] .bg-slate-800,
        [data-theme='light'] .bg-slate-800\/60,
        [data-theme='light'] .bg-slate-800\/70 {
          background-color: #f8fafc !important;
        }
        [data-theme='light'] .border-slate-700,
        [data-theme='light'] .border-slate-800 {
          border-color: #e2e8f0 !important;
        }
        [data-theme='light'] .bg-rose-500\/10 {
          background-color: #fee2e2 !important;
        }
        [data-theme='light'] .bg-black\/60 {
          background-color: rgba(15, 23, 42, 0.35) !important;
        }
        [data-theme='light'] .placeholder-slate-500::placeholder {
          color: #94a3b8 !important;
        }
        [data-theme='light'] .bg-slate-800\/70.text-slate-200,
        [data-theme='light'] .bg-slate-800\/70 .text-slate-200 {
          color: #334155 !important;
        }
        [data-theme='light'] .bg-cyan-500 {
          background-color: #0284c7 !important;
          color: #ffffff !important;
        }
        [data-theme='light'] .hover\:bg-cyan-400:hover {
          background-color: #0369a1 !important;
          color: #ffffff !important;
        }
        [data-theme='light'] .bg-cyan-500\/20 {
          background-color: #e0f2fe !important;
        }
        [data-theme='light'] .text-slate-950 {
          color: #ffffff !important;
        }
        .theme-switch {
          position: relative;
          width: 92px;
          height: 42px;
          border-radius: 9999px;
          border: 1px solid #334155;
          transition: all 0.25s ease;
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
        }
        .theme-switch--dark {
          background: #0f172a;
        }
        .theme-switch--light {
          background: #e2e8f0;
          border-color: #cbd5e1;
        }
        .theme-switch__icon {
          font-size: 16px;
          line-height: 1;
          user-select: none;
          z-index: 1;
        }
        .theme-switch__icon--sun {
          color: #2563eb;
        }
        .theme-switch__icon--moon {
          color: #2563eb;
        }
        .theme-switch--dark .theme-switch__icon--sun {
          color: #93c5fd;
        }
        .theme-switch--light .theme-switch__icon--moon {
          color: #60a5fa;
        }
        .theme-switch__thumb {
          position: absolute;
          top: 3px;
          left: 4px;
          width: 34px;
          height: 34px;
          border-radius: 9999px;
          background: linear-gradient(180deg, #ffffff, #d1d5db);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.35);
          transition: transform 0.25s ease;
        }
        .theme-switch--dark .theme-switch__thumb {
          transform: translateX(50px);
          background: linear-gradient(180deg, #374151, #111827);
        }
        .calendar-wrapper :global(.react-calendar) {
          width: 100%;
          border: none;
          background: transparent;
          color: #e2e8f0;
          font-family: inherit;
        }
        [data-theme='light'] .calendar-wrapper :global(.react-calendar) {
          color: #0f172a;
        }
        .calendar-wrapper :global(.react-calendar__navigation button) {
          color: #e2e8f0;
          background: transparent;
        }
        [data-theme='light'] .calendar-wrapper :global(.react-calendar__navigation button) {
          color: #0f172a;
        }
        .calendar-wrapper :global(.react-calendar__navigation button:hover) {
          background: rgba(51, 65, 85, 0.6);
          border-radius: 8px;
        }
        [data-theme='light'] .calendar-wrapper :global(.react-calendar__navigation button:hover) {
          background: #e2e8f0;
        }
        .calendar-wrapper :global(.react-calendar__tile) {
          color: #e2e8f0;
          border-radius: 8px;
        }
        [data-theme='light'] .calendar-wrapper :global(.react-calendar__tile) {
          color: #0f172a;
        }
        .calendar-wrapper :global(.react-calendar__tile:hover) {
          background: rgba(14, 165, 233, 0.2);
        }
        .calendar-wrapper :global(.react-calendar__tile--active) {
          background: linear-gradient(90deg, #22d3ee, #d946ef);
          color: #0f172a;
        }
        .calendar-wrapper :global(.react-calendar__tile--now) {
          background: rgba(34, 211, 238, 0.2);
          color: #67e8f9;
        }
      `}</style>
    </div>
  );
}
