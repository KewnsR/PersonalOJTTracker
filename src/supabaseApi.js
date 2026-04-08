import { getSupabaseClient } from "./supabase";

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

const ensureUserDefaults = async (supabase, uid, profile = {}) => {
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
    { onConflict: "user_id", ignoreDuplicates: true }
  );

  if (profileError) {
    throw profileError;
  }

  const { error: prefError } = await supabase.from("user_preferences").upsert(
    {
      user_id: uid,
      lunch_start_hour: 11,
      lunch_end_hour: 12,
      required_ojt_hours: 600,
      weekly_journal_notes: {},
      theme_mode: "light",
      updated_at: now,
    },
    { onConflict: "user_id", ignoreDuplicates: true }
  );

  if (prefError) {
    throw prefError;
  }
};

const getSupabase = () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }
  return supabase;
};

const normalizeAuthProvider = (provider = "google") => {
  const normalized = String(provider || "").trim().toLowerCase();

  if (normalized === "azure" || normalized === "microsoft" || normalized === "outlook") {
    return "outlook";
  }

  if (normalized === "email" || normalized === "otp") {
    return "email";
  }

  return "google";
};

export const directGoogleAuth = async (supabaseAccessToken, provider = "google") => {
  if (!supabaseAccessToken) {
    throw new Error("Missing Supabase access token");
  }

  const normalizedProvider = normalizeAuthProvider(provider);

  const supabase = getSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser(supabaseAccessToken);
  if (authError || !authData?.user) {
    throw new Error(authError?.message || "Invalid Supabase access token");
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
    throw new Error("Supabase user payload is missing id/email");
  }

  const fallbackUsername = email.split("@")[0] || `user_${uid.slice(0, 6)}`;

  const { data: existingUserById, error: userByIdFetchError } = await supabase
    .from("users")
    .select("id,name,email,username")
    .eq("id", uid)
    .maybeSingle();

  if (userByIdFetchError) {
    throw userByIdFetchError;
  }

  const { data: existingUserByEmail, error: userByEmailFetchError } = await supabase
    .from("users")
    .select("id,name,email,username")
    .ilike("email", email)
    .maybeSingle();

  if (userByEmailFetchError) {
    throw userByEmailFetchError;
  }

  const existingUser = existingUserById || existingUserByEmail;
  const resolvedUserId = existingUser?.id || uid;

  const now = new Date().toISOString();
  const userPayload = {
    id: resolvedUserId,
    name: existingUser?.name || name,
    email: existingUser?.email || email,
    username: existingUser?.username || fallbackUsername,
    auth_provider: normalizedProvider,
    updated_at: now,
  };

  let { data: upsertedUser, error: upsertUserError } = await supabase
    .from("users")
    .upsert(userPayload, { onConflict: "id" })
    .select("id,name,email,username")
    .single();

  // If a legacy row exists under the same email, recover by reading that row.
  if (upsertUserError?.code === "23505" && upsertUserError?.message?.includes("users_email_key")) {
    const { data: userByEmailAfterConflict, error: refetchByEmailError } = await supabase
      .from("users")
      .select("id,name,email,username")
      .ilike("email", email)
      .maybeSingle();

    if (refetchByEmailError) {
      throw refetchByEmailError;
    }

    if (userByEmailAfterConflict) {
      upsertedUser = userByEmailAfterConflict;
      upsertUserError = null;
    } else {
      // Last-resort retry: target conflict by email and avoid overriding the row id.
      const userPayloadByEmail = {
        name,
        email,
        username: fallbackUsername,
        auth_provider: "google",
        updated_at: now,
      };

      const { data: upsertedByEmail, error: upsertByEmailError } = await supabase
        .from("users")
        .upsert(userPayloadByEmail, { onConflict: "email" })
        .select("id,name,email,username")
        .single();

      if (upsertByEmailError) {
        throw upsertByEmailError;
      }

      upsertedUser = upsertedByEmail;
      upsertUserError = null;
    }
  }

  if (upsertUserError) {
    throw upsertUserError;
  }

  await ensureUserDefaults(supabase, upsertedUser.id, {
    name: upsertedUser.name,
    email: upsertedUser.email,
  });

  return {
    token: `supabase:${upsertedUser.id}`,
    user: toUserResponse(upsertedUser),
  };
};

export const directLoadDashboard = async (uid, fallbackUser = null) => {
  if (!uid) {
    throw new Error("Missing user id");
  }

  const supabase = getSupabase();
  const [entriesResult, prefsResult, profileResult] = await Promise.allSettled([
    supabase
      .from("entries")
      .select("id,date,time_in,time_out,hours,notes,created_at,updated_at")
      .eq("user_id", uid)
      .order("date", { ascending: false })
      .order("time_in", { ascending: false }),
    supabase
      .from("user_preferences")
      .select("lunch_start_hour,lunch_end_hour,required_ojt_hours,weekly_journal_notes,theme_mode")
      .eq("user_id", uid)
      .maybeSingle(),
    supabase
      .from("user_profile")
      .select("name,position,company,email,department,supervisor")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  const unwrapResult = (result) => {
    if (result.status === "rejected") {
      throw result.reason;
    }
    if (result.value?.error) {
      throw result.value.error;
    }
    return result.value?.data ?? null;
  };

  const entriesData = unwrapResult(entriesResult) || [];
  const prefsData = unwrapResult(prefsResult);
  const profileData = unwrapResult(profileResult);

  let prefs = prefsData;
  if (!prefs) {
    const now = new Date().toISOString();
    const defaultPrefs = {
      user_id: uid,
      lunch_start_hour: 11,
      lunch_end_hour: 12,
      required_ojt_hours: 600,
      weekly_journal_notes: {},
      theme_mode: "light",
      updated_at: now,
    };

    const { error: prefInsertError } = await supabase
      .from("user_preferences")
      .upsert(defaultPrefs, { onConflict: "user_id" });

    if (prefInsertError) {
      throw prefInsertError;
    }

    prefs = defaultPrefs;
  }

  let profile = profileData;
  if (!profile) {
    const now = new Date().toISOString();
    const defaultProfile = {
      user_id: uid,
      name: fallbackUser?.name || "OJT Trainee",
      position: "",
      company: "",
      email: fallbackUser?.email || "",
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

    profile = defaultProfile;
  }

  return {
    entries: entriesData.map(toEntryResponse),
    preferences: {
      lunchStartHour: prefs.lunch_start_hour ?? 11,
      lunchEndHour: prefs.lunch_end_hour ?? 12,
      requiredOjtHours: prefs.required_ojt_hours ?? 600,
      weeklyJournalNotes: prefs.weekly_journal_notes || {},
      themeMode: prefs.theme_mode || "light",
    },
    profile: {
      name: profile.name || fallbackUser?.name || "OJT Trainee",
      position: profile.position || "",
      company: profile.company || "",
      email: profile.email || fallbackUser?.email || "",
      department: profile.department || "",
      supervisor: profile.supervisor || "",
    },
  };
};

export const directCreateEntry = async (uid, payload) => {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("entries")
    .insert({
      user_id: uid,
      date: payload?.date,
      time_in: payload?.timeIn,
      time_out: payload?.timeOut,
      hours: payload?.hours,
      notes: payload?.notes || "",
      created_at: now,
      updated_at: now,
    })
    .select("id,date,time_in,time_out,hours,notes,created_at,updated_at")
    .single();

  if (error) throw error;
  return toEntryResponse(data);
};

export const directUpdateEntry = async (uid, entryId, payload) => {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("entries")
    .update({
      date: payload?.date,
      time_in: payload?.timeIn,
      time_out: payload?.timeOut,
      hours: payload?.hours,
      notes: payload?.notes || "",
      updated_at: now,
    })
    .eq("id", entryId)
    .eq("user_id", uid)
    .select("id,date,time_in,time_out,hours,notes,created_at,updated_at")
    .single();

  if (error) throw error;
  return toEntryResponse(data);
};

export const directDeleteEntry = async (uid, entryId) => {
  const supabase = getSupabase();
  const { error } = await supabase.from("entries").delete().eq("id", entryId).eq("user_id", uid);
  if (error) throw error;
};

export const directUpdatePreferences = async (uid, payload) => {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const nextPayload = {
    user_id: uid,
    lunch_start_hour: payload?.lunchStartHour,
    lunch_end_hour: payload?.lunchEndHour,
    required_ojt_hours: payload?.requiredOjtHours,
    weekly_journal_notes: payload?.weeklyJournalNotes,
    theme_mode: payload?.themeMode,
    updated_at: now,
  };

  Object.keys(nextPayload).forEach((key) => {
    if (nextPayload[key] === undefined) {
      delete nextPayload[key];
    }
  });

  const { data, error } = await supabase
    .from("user_preferences")
    .upsert(nextPayload, { onConflict: "user_id" })
    .select("lunch_start_hour,lunch_end_hour,required_ojt_hours,weekly_journal_notes,theme_mode")
    .single();

  if (error) throw error;

  return {
    lunchStartHour: data.lunch_start_hour ?? 11,
    lunchEndHour: data.lunch_end_hour ?? 12,
    requiredOjtHours: data.required_ojt_hours ?? 600,
    weeklyJournalNotes: data.weekly_journal_notes || {},
    themeMode: data.theme_mode || "light",
  };
};

export const directUpdateProfile = async (uid, authUser, payload) => {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const profilePayload = {
    user_id: uid,
    name: payload?.name,
    position: payload?.position,
    company: payload?.company,
    email: payload?.email,
    department: payload?.department,
    supervisor: payload?.supervisor,
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

  if (profileError) throw profileError;

  const userPayload = {
    id: uid,
    name: profileRow.name || authUser?.name || "OJT Trainee",
    email: (profileRow.email || authUser?.email || "").toLowerCase(),
    username: authUser?.username || ((profileRow.email || authUser?.email || "").split("@")[0] || `user_${String(uid).slice(0, 6)}`),
    auth_provider: "google",
    updated_at: now,
  };

  const { error: userError } = await supabase.from("users").upsert(userPayload, { onConflict: "id" });
  if (userError) throw userError;

  return {
    name: profileRow.name || "OJT Trainee",
    position: profileRow.position || "",
    company: profileRow.company || "",
    email: profileRow.email || authUser?.email || "",
    department: profileRow.department || "",
    supervisor: profileRow.supervisor || "",
  };
};
