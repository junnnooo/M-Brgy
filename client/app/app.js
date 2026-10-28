const { createApp } = Vue;

// Today's date in Philippine time (YYYY-MM-DD). toISOString() is UTC, which gives yesterday's date
// between midnight and 8 AM in Manila.
const todayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

// Reference numbers: <brgy PSGC>-<10|20|21>-<year>-<5 digits>[-<update>], dashes optional.
//                    10 = document request, 20 = concern report, 21 = update to a concern report.
const parseRef = (value) => {
  const m = String(value ?? "")
    .replace(/\s+/g, "")
    .match(/^(\d{10})-?(\d{2})-?(\d{4})-?(\d{5})(?:-?(\d{2,}))?$/);
  if (!m) return null;
  const [, brgy, type, year, no, update] = m;
  return { type, canonical: `${brgy}-${type}-${year}-${no}${update ? "-" + update : ""}` };
};

// Dismissed emergency banner: remembered per resident account, in this browser only
const DISMISSED_KEY = "kabrgy_dismissed_alerts";
const loadDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
};
const saveDismissed = (map) => {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch (e) {
    /* storage unavailable: the dismissal only lasts for this visit */
  }
};

const TIME_SLOTS = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
];

// Reaching one of these statuses is final: the item is moved to the archive automatically.
const FINAL_STATUS = {
  doc: ["Completed", "Rejected"],
  report: ["Resolved", "Rejected"],
};

// Account moderation + limits (the server enforces the same numbers)
const MAX_WARNINGS = 3;
const MAX_ACTIVE = 3;
const LIVE_STATUS = {
  doc: ["Pending", "Approved", "Ready for Pickup"],
  report: ["Submitted", "Received", "In Progress"],
};
// Documents allowed per submission: Barangay 1 to 8 allow 2, every other barangay allows 3.
//                                   The number is read from the barangay name, e.g. "Lantic (Barangay 13)".
const docLimitFor = (name) => {
  const n = Number(String(name || "").match(/barangay\s*(\d+)/i)?.[1]);
  return n >= 1 && n <= 8 ? 2 : 3;
};

// Admin side bar: collapsed or not, remembered in this browser
const SIDEBAR_KEY = "kabrgy_sidebar_collapsed";
const loadSidebar = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch (e) {
    return false;
  }
};

const blankStanding = () => ({
  deactivated: false, deactivation_reason: "", deactivated_at: "", warnings: [], appeal: null,
});
const blankResident = () => ({
  first_name: "", middle_name: "", last_name: "",
  email: "", address: "", contact_number: "", verified: false,
  ...blankStanding(),
});
const defaultSettings = () => ({ name: "kaBRGY", address: "", hours: "" });
const blankSignup = () => ({ first_name: "", last_name: "", email: "", brgy_id: "", password: "", confirm: "" });
const blankPost = () => ({ title: "", type: "Announcement", body: "", date: todayString() });
const blankDocumentForm = () => ({
  province_id: "", municipality_id: "", brgy_id: "",
  service_type_ids: [], purpose: "", date: "", time: "",
});
const blankReportForm = () => ({
  province_id: "", municipality_id: "", brgy_id: "",
  category: "", location: "", description: "",
});

createApp({
  data() {
    return {
      booting: true,
      me: null,
      resident: blankResident(),
      settings: defaultSettings(),

      // Data Lists: loaded from the API on boot or when the barangay changes
      locations: [],
      services: [],
      posts: [],
      alerts: [],
      requests: [],
      reports: [],
      profiles: [],
      notifications: [],
      archivedPosts: [], // staff only: archived announcements (hidden from residents)
      archivedAlerts: [], // staff only: archived emergency alerts

      authView: "resident",
      authMode: "login",
      authError: "",
      loginForm: { email: "", password: "" },
      signupForm: blankSignup(),
      adminForm: { email: "", password: "" },
      page: "home",
      adminPage: "overview",
      sidebarCollapsed: loadSidebar(),
      announcementFilter: "All",
      requestFilter: "All",
      reportFilter: "All",
      documentForm: blankDocumentForm(),
      reportForm: blankReportForm(),
      postForm: blankPost(),

      // admin tables: search by email + Active / Archived views
      verifSearch: "",
      docSearch: "",
      reportSearch: "",
      docView: "active",
      reportView: "active",
      verifFilter: "all",
      annView: "active",
      annTypeFilter: "All",
      deletingId: "",
      docSelected: [],
      reportSelected: [],
      dismissedAlerts: loadDismissed(),

      // Track Status: one lookup for either a document request (-10-) or a concern report (-20-/-21-)
      trackId: "",
      trackSearched: false,
      trackLoading: false,
      trackSeq: 0,
      trackedItem: null,
      docStatusFilter: "All",
      reportStatusFilter: "All",
      docExpanded: false,
      reportExpanded: false,
      trackLimit: 3, // rows shown before "See all"

      // Reject dialog: staff must give a reason before rejecting a request or a report
      rejectDialog: null,
      rejectError: "",

      // Account moderation: staff dialog (warn / deactivate / deny an appeal), resident appeal + warning pop-up
      accountDialog: null,
      accountError: "",
      appealText: "",
      warningAck: false,

      notifOpen: false,
      menuOpen: false, // the avatar dropdown (Profile / Track Status / Log out)
      modal: "",
      modalTitle: "",
      modalMessage: "",
      modalRef: "",
      modalNext: "home",
      toast: "",
      showPostForm: false,
    };
  },
  computed: {
    today() {
      return todayString();
    },
    role() {
      if (!this.me) return null;
      return this.me.is_staff ? "admin" : "resident";
    },
    residentName() {
      const r = this.resident;
      return [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ");
    },
    residentInitial() {
      return (this.resident.first_name || "R").charAt(0).toUpperCase();
    },
    timeSlots() {
      return TIME_SLOTS;
    },
    allBarangays() {
      const list = [];
      for (const p of this.locations)
        for (const m of p.municipalities)
          for (const b of m.barangays)
            list.push({
              brgy_id: b.brgy_id,
              label: `${b.brgy_name} — ${m.municipality_name}, ${p.province_name}`,
            });
      return list;
    },
// Table Separation: Announcements, Requests, Reports, Profiles
    announcements() {
      return [...this.posts, ...this.alerts].sort((a, b) => b.date.localeCompare(a.date));
    },
    latestAnnouncements() {
      return this.announcements.slice(0, 3);
    },
    archivedAnnouncements() {
      return [...this.archivedPosts, ...this.archivedAlerts].sort((a, b) => b.date.localeCompare(a.date));
    },
    adminAnnouncements() {
      const list = this.annView === "archived" ? this.archivedAnnouncements : this.announcements;
      return list.filter((a) => this.annTypeFilter === "All" || a.type === this.annTypeFilter);
    },
    emergencyCount() {
      return this.announcements.filter((a) => a.type === "Emergency").length;
    },
    recentAdminAnnouncements() {
      return this.announcements.slice(0, 5);
    },
    activeAlert() {
      const now = Date.now();
      return (
        this.alerts.find(
          (a) =>
            new Date(a.starts_at).getTime() <= now &&
            (!a.expires_at || new Date(a.expires_at).getTime() > now),
        ) || null
      );
    },
    emergencyDismissed() {
      return Boolean(
        this.me && this.activeAlert && this.dismissedAlerts[this.me.id] === this.activeAlert.id,
      );
    },
    // Account moderation:
    maxWarnings() {
      return MAX_WARNINGS;
    },
    activeProfiles() {
      return this.profiles.filter((p) => !p.deactivated);
    },
    deactivatedProfiles() {
      return this.profiles.filter((p) => p.deactivated);
    },
    pendingAppeals() {
      return this.deactivatedProfiles.filter((p) => p.appeal && p.appeal.status === "Pending");
    },
    recentProfiles() {
      return this.activeProfiles.slice(0, 5);
    },
    // Per-resident limits: only in-progress items count; a final status frees a slot
    maxActiveRequests() {
      return MAX_ACTIVE;
    },
    activeDocCount() {
      return this.residentRequests.filter((r) => LIVE_STATUS.doc.includes(r.status)).length;
    },
    activeReportCount() {
      return this.residentReports.filter((r) => LIVE_STATUS.report.includes(r.status)).length;
    },
    docLimitReached() {
      return this.activeDocCount >= MAX_ACTIVE;
    },
    reportLimitReached() {
      return this.activeReportCount >= MAX_ACTIVE;
    },
    docLimit() {
      const b = this.brgys(this.documentForm).find((x) => x.brgy_id === this.documentForm.brgy_id);
      return b ? docLimitFor(b.brgy_name) : 0;
    },
    residentRequests() {
      return this.requests;
    },
    residentReports() {
      return this.reports;
    },
    residentNotifications() {
      return this.notifications;
    },
    unreadCount() {
      return this.notifications.filter((n) => !n.read).length;
    },
    filteredAnnouncements() {
      return this.announcements.filter(
        (a) => this.announcementFilter === "All" || a.type === this.announcementFilter,
      );
    },
    pendingResidents() {
      return this.activeProfiles.filter((p) => !p.verified);
    },
    verifiedResidents() {
      return this.activeProfiles.filter((p) => p.verified);
    },
    activeRequests() {
      return this.requests.filter((r) => !r.archived);
    },
    archivedRequests() {
      return this.requests.filter((r) => r.archived);
    },
    activeReports() {
      return this.reports.filter((r) => !r.archived);
    },
    archivedReports() {
      return this.reports.filter((r) => r.archived);
    },
    pendingRequests() {
      return this.activeRequests.filter((r) => r.status === "Pending");
    },
    openReports() {
      return this.activeReports.filter((r) => r.status !== "Resolved");
    },
    filteredProfiles() {
      const base =
        this.verifFilter === "deactivated"
          ? this.deactivatedProfiles
          : this.verifFilter === "verified"
            ? this.verifiedResidents
            : this.verifFilter === "pending"
              ? this.pendingResidents
              : this.activeProfiles;
      return base.filter((p) => this.matches(this.verifSearch, [p.email, p.name, p.address]));
    },
    filteredRequests() {
      const list = this.docView === "archived" ? this.archivedRequests : this.activeRequests;
      return list.filter(
        (r) =>
          (this.requestFilter === "All" || r.status === this.requestFilter) &&
          this.matches(this.docSearch, [r.email, r.name, r.ref]),
      );
    },
    filteredReports() {
      const list = this.reportView === "archived" ? this.archivedReports : this.activeReports;
      return list.filter(
        (r) =>
          (this.reportFilter === "All" ||
            (this.reportFilter === "Open" ? r.status !== "Resolved" : r.status === this.reportFilter)) &&
          this.matches(this.reportSearch, [r.email, r.name, r.ref]),
      );
    },
    documentStatuses() {
      return ["Pending", "Approved", "Ready for Pickup", "Completed"];
    },
    reportStatuses() {
      return ["Submitted", "Received", "In Progress", "Resolved"];
    },
    // Track Status lists: status dropdown, and "See all" / "See less"
    docFilterOptions() {
      return ["All", ...this.documentStatuses, "Rejected"];
    },
    reportFilterOptions() {
      return ["All", ...this.reportStatuses, "Rejected"];
    },
    filteredResidentRequests() {
      return this.residentRequests.filter(
        (r) => this.docStatusFilter === "All" || r.status === this.docStatusFilter,
      );
    },
    filteredResidentReports() {
      return this.residentReports.filter(
        (r) => this.reportStatusFilter === "All" || r.status === this.reportStatusFilter,
      );
    },
    visibleRequests() {
      return this.docExpanded
        ? this.filteredResidentRequests
        : this.filteredResidentRequests.slice(0, this.trackLimit);
    },
    visibleReports() {
      return this.reportExpanded
        ? this.filteredResidentReports
        : this.filteredResidentReports.slice(0, this.trackLimit);
    },
    adminTitle() {
      return {
        overview: "Official dashboard",
        verifications: "Resident verification",
        documents: "Document requests",
        reports: "Concern reports",
        posts: "Announcements & alerts",
        settings: "Barangay settings",
      }[this.adminPage];
    },
  },
  watch: {
    "documentForm.brgy_id"() {
      const max = this.docLimit;
      const ids = this.documentForm.service_type_ids;
      if (max && ids.length > max) {
        this.documentForm.service_type_ids = ids.slice(0, max);
        this.notify(`This barangay allows up to ${max} documents per request. Your selection was trimmed.`);
      }
    },
    // a bulk selection never survives a change of what is on screen
    docStatusFilter() { this.docExpanded = false; },
    reportStatusFilter() { this.reportExpanded = false; },
    docView() { this.docSelected = []; },
    requestFilter() { this.docSelected = []; },
    docSearch() { this.docSelected = []; },
    reportView() { this.reportSelected = []; },
    reportFilter() { this.reportSelected = []; },
    reportSearch() { this.reportSelected = []; },
    adminPage() { this.docSelected = []; this.reportSelected = []; },
  },
  methods: {
    // The Session: On boot, check if the user is logged in and load their session data,
    //              including their profile and related records. If the access token is invalid, clear it and reset the user state.
    async boot() {
      api.onAuthLost = () => this.logout();
      try {
        this.locations = await api.get("/locations");
      } catch (e) {
        this.authError = e.message;
      }
      if (api.accessToken) {
        try {
          await this.loadSession();
        } catch (e) {
          api.clearTokens();
          this.me = null;
        }
      }
      this.booting = false;
    },
    async loadSession() {
      this.applyMe(await api.get("/auth/me"));
      await this.loadAll();
    },
    applyMe(me) {
      this.me = me;
      this.resident = {
        first_name: me.first_name,
        middle_name: me.middle_name,
        last_name: me.last_name,
        email: me.email,
        address: me.address,
        contact_number: me.contact_number,
        verified: me.verified,
        ...this.standingOf(me),
      };
      this.warningAck = !me.deactivated && me.warnings.some((w) => !w.seen);
      if (me.barangay) {
        this.settings = {
          name: me.barangay.brgy_name,
          address: me.barangay.address || "",
          hours: me.barangay.office_hours || "",
        };
      }
    },
    standingOf(me) {
      return {
        deactivated: Boolean(me.deactivated),
        deactivation_reason: me.deactivation_reason || "",
        deactivated_at: me.deactivated_at || "",
        warnings: me.warnings || [],
        appeal: me.appeal || null,
      };
    },
    // Poll for a new warning or a deactivation without touching the profile form the resident may be editing
    async refreshStanding() {
      if (this.role !== "resident") return;
      try {
        const me = await api.get("/auth/me");
        Object.assign(this.resident, this.standingOf(me));
        this.me = { ...this.me, ...this.standingOf(me) };
        if (!me.deactivated && me.warnings.some((w) => !w.seen)) this.warningAck = true;
      } catch (e) {
        /* the next poll will try again */
      }
    },
    async loadAll() {
      const q = this.me.brgy_id ? `?brgy_id=${this.me.brgy_id}` : "";
      const staff = this.role === "admin";
      const [posts, alerts, notifications, requests, reports, profiles, archivedPosts, archivedAlerts] =
        await Promise.all([
          api.get(`/announcements${q}`),
          api.get(`/alerts${q}`),
          api.get("/notifications"),
          api.get(staff ? "/requests" : "/requests/mine"),
          api.get(staff ? "/reports" : "/reports/mine"),
          staff ? api.get("/accounts") : Promise.resolve([]),
          staff ? api.get("/announcements/archived") : Promise.resolve([]),
          staff ? api.get("/alerts/archived") : Promise.resolve([]),
        ]);
      Object.assign(this, {
        posts, alerts, notifications, requests, reports, profiles, archivedPosts, archivedAlerts,
      });
    },
    // Background refresh of the lists the signed-in user sees. Used by the polling timer.
    async refreshLive() {
      if (!this.me || document.visibilityState === "hidden") return;
      try {
        if (this.role === "resident") {
          await Promise.all([this.loadNotifications(), this.refreshStanding()]);
        } else {
          await this.refreshStaffData();
        }
      } catch (e) {
        /* the next poll will try again */
      }
    },
    // Staff: reload the tables quietly (no error toasts) so new requests and reports show up on their own
    async refreshStaffData() {
      if (this.role !== "admin") return;
      // don't swap the rows out from under a dialog the staff member is filling in
      if (this.rejectDialog || this.accountDialog) return;
      const q = this.me.brgy_id ? `?brgy_id=${this.me.brgy_id}` : "";
      const [requests, reports, profiles, posts, alerts] = await Promise.all([
        api.get("/requests"),
        api.get("/reports"),
        api.get("/accounts"),
        api.get(`/announcements${q}`),
        api.get(`/alerts${q}`),
      ]);
      Object.assign(this, { requests, reports, profiles, posts, alerts });
    },

    // The Helpers
    formatDate(d) {
      if (!d) return "Date not set";
      const x = new Date(`${d}T12:00:00`);
      return x.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
    },
    day(d) {
      return d ? new Date(`${d}T12:00:00`).getDate() : "—";
    },
    month(d) {
      return d
        ? new Date(`${d}T12:00:00`).toLocaleDateString("en-PH", { month: "short" }).toUpperCase()
        : "—";
    },
    statusClass(s) {
      return (
        {
          Pending: "status-pending",
          Submitted: "status-submitted",
          Received: "status-received",
          Approved: "status-approved",
          "Ready for Pickup": "status-ready",
          Completed: "status-done",
          Resolved: "status-done",
          "In Progress": "status-progress",
          Rejected: "status-rejected",
        }[s] || "status-pending"
      );
    },
    statusIndex(s) {
      return this.reportStatuses.indexOf(s);
    },
    docStatusIndex(s) {
      return this.documentStatuses.indexOf(s);
    },
    reasonOf(item) {
      return (item && (item.rejection_reason || item.rejectionReason)) || "";
    },
    countByStatus(list, s) {
      return s === "All" ? list.length : list.filter((r) => r.status === s).length;
    },
    matches(query, fields) {
      const q = (query || "").trim().toLowerCase();
      if (!q) return true;
      return fields.some((f) => (f || "").toLowerCase().includes(q));
    },
    timeAgo(iso) {
      const t = iso ? new Date(iso).getTime() : NaN;
      if (Number.isNaN(t)) return "";
      const m = Math.floor((Date.now() - t) / 60000);
      if (m < 1) return "Just now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return this.formatDate(new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
    },
    notify(msg) {
      this.toast = msg;
      setTimeout(() => {
        this.toast = "";
      }, 2800);
    },

    // Location Pickers:
    munis(form) {
      const p = this.locations.find((x) => x.province_id === form.province_id);
      return p ? p.municipalities : [];
    },
    brgys(form) {
      const m = this.munis(form).find((x) => x.municipality_id === form.municipality_id);
      return m ? m.barangays : [];
    },
    findLocation(brgyId) {
      for (const p of this.locations)
        for (const m of p.municipalities) {
          const b = m.barangays.find((x) => x.brgy_id === brgyId);
          if (b)
            return { province_id: p.province_id, municipality_id: m.municipality_id, brgy_id: b.brgy_id };
        }
      return null;
    },
    prepareForm(form) {
      if (!form.brgy_id) Object.assign(form, this.findLocation(this.me?.brgy_id) || {});
    },
    async loadServices(brgyId) {
      try {
        this.services = brgyId ? await api.get(`/services?brgy_id=${brgyId}`) : [];
      } catch (e) {
        this.services = [];
        this.notify(e.message);
      }
    },

    setAuthView(v) {
      this.authView = v;
      this.authError = "";
    },
    setAuthMode(m) {
      this.authMode = m;
      this.authError = "";
    },
    async afterLogin() {
      this.page = "home";
      this.adminPage = "overview";
      this.loginForm = { email: "", password: "" };
      this.signupForm = blankSignup();
      this.adminForm = { email: "", password: "" };
      this.authError = "";
      window.scrollTo({ top: 0 });
      this.notify(`Welcome, ${this.resident.first_name || "back"}`);
    },
    async doLogin(email, password, expected) {
      this.authError = "";
      try {
        api.setTokens(await api.post("/auth/login", { email: email.trim(), password }));
        await this.loadSession();
      } catch (e) {
        api.clearTokens();
        this.me = null;
        this.authError = e.message;
        return;
      }
      if (expected === "admin" && this.role !== "admin") {
        this.logout();
        this.authView = "admin";
        this.authError = "This account doesn't have admin access.";
        return;
      }
      await this.afterLogin();
    },
    loginResident() {
      return this.doLogin(this.loginForm.email, this.loginForm.password, "resident");
    },
    loginAdmin() {
      return this.doLogin(this.adminForm.email, this.adminForm.password, "admin");
    },
    async signUpResident() {
      const f = this.signupForm;
      if (f.password.length < 6) {
        this.authError = "Use a password with at least 6 characters.";
        return;
      }
      if (f.password !== f.confirm) {
        this.authError = "The two passwords do not match.";
        return;
      }
      try {
        api.setTokens(
          await api.post("/auth/signup", {
            first_name: f.first_name,
            last_name: f.last_name,
            email: f.email,
            password: f.password,
            brgy_id: f.brgy_id,
          }),
        );
        await this.loadSession();
      } catch (e) {
        api.clearTokens();
        this.me = null;
        this.authError = e.message;
        return;
      }
      await this.afterLogin();
    },
    logout() {
      const wasAdmin = this.role === "admin";
      api.clearTokens();
      this.me = null;
      this.resident = blankResident();
      this.settings = defaultSettings();
      Object.assign(this, {
        services: [], posts: [], alerts: [], requests: [], reports: [], profiles: [], notifications: [],
        archivedPosts: [], archivedAlerts: [],
      });
      this.documentForm = blankDocumentForm();
      this.reportForm = blankReportForm();
      this.trackId = "";
      this.trackSearched = false;
      this.trackLoading = false;
      this.trackedItem = null;
      this.trackSeq++;
      this.notifOpen = false;
      this.menuOpen = false;
      this.verifSearch = this.docSearch = this.reportSearch = "";
      this.docView = this.reportView = "active";
      this.verifFilter = "all";
      this.annView = "active";
      this.reportFilter = "All";
      this.docStatusFilter = this.reportStatusFilter = "All";
      this.docExpanded = this.reportExpanded = false;
      this.rejectDialog = null;
      this.rejectError = "";
      this.accountDialog = null;
      this.accountError = "";
      this.appealText = "";
      this.warningAck = false;
      this.annTypeFilter = "All";
      this.deletingId = "";
      this.docSelected = [];
      this.reportSelected = [];
      this.page = "home";
      this.adminPage = "overview";
      this.authView = wasAdmin ? "admin" : "resident";
      this.authMode = "login";
      this.authError = "";
      window.scrollTo({ top: 0 });
    },

    // Residents Document:
    async openDocument() {
      this.page = "documents";
      this.prepareForm(this.documentForm);
      if (this.documentForm.brgy_id && !this.services.length) {
        await this.loadServices(this.documentForm.brgy_id);
      }
    },
    async openAppointment() {
      await this.openDocument();
      const clearance = this.services.find((s) => s.service_name === "Barangay Clearance");
      if (clearance) this.documentForm.service_type_ids = [clearance.service_type_id];
      this.documentForm.purpose = "Appointment / document processing";
    },
    // Checkbox rules for the document picker: never more than the barangay allows
    docPickDisabled(id) {
      const ids = this.documentForm.service_type_ids;
      return !this.docLimit || (ids.length >= this.docLimit && !ids.includes(id));
    },
    async submitDocument() {
      if (this.resident.deactivated) return;
      if (!this.resident.verified) {
        this.page = "account";
        this.notify("Please complete resident verification first.");
        return;
      }
      const f = this.documentForm;
      if (!f.service_type_ids.length) {
        this.notify("Please select at least one document.");
        return;
      }
      if (f.service_type_ids.length > this.docLimit) {
        this.notify(`This barangay allows up to ${this.docLimit} documents per request.`);
        return;
      }
      if (this.activeDocCount + f.service_type_ids.length > MAX_ACTIVE) {
        this.notify(
          `You can have at most ${MAX_ACTIVE} active document requests (you have ${this.activeDocCount}). Wait until one is completed or rejected.`,
        );
        return;
      }
      try {
        const created = await api.post("/requests", {
          service_type_ids: f.service_type_ids,
          brgy_id: f.brgy_id,
          purpose: f.purpose,
          appointment_date: f.date,
          appointment_time: f.time,
        });
        this.requests.unshift(...created);
        const refs = created.map((r) => r.ref);
        this.modalTitle = created.length > 1 ? "Requests submitted" : "Request submitted";
        this.modalMessage =
          created.length > 1
            ? `Your ${created.length} document requests have been sent to the barangay, one reference number each. Use Track Status to follow their progress.`
            : "Your document request has been sent to the barangay. Keep the reference number and use Track Status to follow its progress.";
        this.modalRef = refs.join(", ");
        this.modalNext = "track";
        this.trackId = refs[0];
        this.modal = "success";
        this.documentForm = blankDocumentForm();
        this.prepareForm(this.documentForm);
        await this.loadServices(this.documentForm.brgy_id);
      } catch (e) {
        this.notify(e.message);
      }
    },

    // Residents Reports:
    openReport() {
      this.page = "report";
      this.prepareForm(this.reportForm);
    },
    async submitReport() {
      if (this.resident.deactivated) return;
      if (this.reportLimitReached) {
        this.notify(
          `You already have ${MAX_ACTIVE} active concern reports. Wait until one is resolved or rejected.`,
        );
        return;
      }
      const f = this.reportForm;
      try {
        const r = await api.post("/reports", {
          category: f.category,
          location: f.location,
          description: f.description,
          brgy_id: f.brgy_id,
        });
        this.reports.unshift(r);
        this.modalTitle = "Report submitted";
        this.modalMessage =
          "Thank you for reporting this concern. Use the reference number to check the status as barangay staff reviews it.";
        this.modalRef = r.ref;
        this.modalNext = "track";
        this.trackId = r.ref;
        this.modal = "success";
        this.reportForm = blankReportForm();
        this.prepareForm(this.reportForm);
      } catch (e) {
        this.notify(e.message);
      }
    },

    // Track Status: the reference number says what it is. -10- is a document request, -20- a concern
    //               report, -21- an update to a concern report (it opens that report).
    async trackSearch() {
      const seq = ++this.trackSeq;
      this.trackSearched = true;
      this.trackedItem = null;
      const ref = parseRef(this.trackId);
      const kind = ref?.type === "10" ? "document" : ref?.type === "20" || ref?.type === "21" ? "report" : "";
      if (!kind) return;

      this.trackLoading = true;
      try {
        const data = await api.get(`${kind === "report" ? "/reports" : "/requests"}/${ref.canonical}`);
        if (seq === this.trackSeq) this.trackedItem = { kind, data };
      } catch (e) {
        if (e.status !== 404 && seq === this.trackSeq) this.notify(e.message);
      } finally {
        if (seq === this.trackSeq) this.trackLoading = false;
      }
    },

    closeTrack() {
      this.trackSeq++;
      this.trackSearched = false;
      this.trackLoading = false;
      this.trackedItem = null;
      this.trackId = "";
    },

    // Residents Profile:
    async saveProfile() {
      const r = this.resident;
      try {
        this.applyMe(
          await api.patch("/auth/me", {
            first_name: r.first_name,
            middle_name: r.middle_name,
            last_name: r.last_name,
            address: r.address,
            contact_number: r.contact_number,
          }),
        );
        this.notify("Resident profile saved");
      } catch (e) {
        this.notify(e.message);
      }
    },

    // Residents Notifications (the bell):
    async loadNotifications() {
      if (this.role !== "resident") return;
      try {
        this.notifications = await api.get("/notifications");
      } catch (e) {
        this.notify(e.message);
      }
    },
    toggleNotifications() {
      this.notifOpen = !this.notifOpen;
      if (this.notifOpen) {
        this.menuOpen = false; // only one floating box open at a time
        this.loadNotifications();
      }
    },
    // Avatar dropdown
    toggleMenu() {
      this.menuOpen = !this.menuOpen;
      if (this.menuOpen) this.notifOpen = false;
    },
    menuGo(page) {
      this.menuOpen = false;
      this.page = page;
      window.scrollTo({ top: 0 });
    },
    menuLogout() {
      this.menuOpen = false;
      this.logout();
    },
    async markAllRead() {
      try {
        await api.post("/notifications/read-all");
        this.notifications.forEach((n) => (n.read = true));
      } catch (e) {
        this.notify(e.message);
      }
    },
    async openNotification(n) {
      this.notifOpen = false;
      const wasUnread = !n.read;
      n.read = true;
      if (n.ref) {
        this.trackId = n.ref;
        this.page = "track";
        this.trackSearch();
      } else if (n.kind === "alert") {
        this.page = "announcements";
      } else if (n.kind === "account") {
        this.page = "account";
      }
      window.scrollTo({ top: 0 });
      if (!wasUnread) return;
      try {
        await api.post(`/notifications/${n.id}/read`);
      } catch (e) {
        n.read = false;
        this.notify(e.message);
      }
    },
    async clearNotifications() {
      try {
        await api.del("/notifications");
        this.notifications = [];
        this.notifOpen = false;
      } catch (e) {
        this.notify(e.message);
      }
    },

    // For Admins:
    // Dashboard numbers: jump to a page with the matching filter preset
    goAdmin(target) {
      const t = {
        profiles: ["verifications", () => { this.verifFilter = "all"; }],
        pendingVerif: ["verifications", () => { this.verifFilter = "pending"; }],
        deactivated: ["verifications", () => { this.verifFilter = "deactivated"; }],
        requests: ["documents", () => { this.docView = "active"; this.requestFilter = "All"; }],
        awaiting: ["documents", () => { this.docView = "active"; this.requestFilter = "Pending"; }],
        reports: ["reports", () => { this.reportView = "active"; this.reportFilter = "All"; }],
        open: ["reports", () => { this.reportView = "active"; this.reportFilter = "Open"; }],
        posts: ["posts", () => { this.annView = "active"; this.annTypeFilter = "All"; }],
        emergency: ["posts", () => { this.annView = "active"; this.annTypeFilter = "Emergency"; }],
        archived: ["posts", () => { this.annView = "archived"; this.annTypeFilter = "All"; }],
      }[target];
      if (!t) return;
      this.verifSearch = this.docSearch = this.reportSearch = "";
      t[1]();
      this.adminPage = t[0];
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, this.sidebarCollapsed ? "1" : "0");
      } catch (e) {
        /* storage unavailable: the choice only lasts for this visit */
      }
    },
    async toggleVerified(p) {
      const next = !p.verified;
      try {
        await api.patch(`/accounts/${p.id}/verification`, { verified: next });
        p.verified = next;
        this.notify(next ? "Resident marked verified" : "Verification revoked");
      } catch (e) {
        this.notify(e.message);
      }
    },
    openAccountDialog(mode, profile) {
      this.accountDialog = { mode, profile, reason: "" };
      this.accountError = "";
    },
    closeAccountDialog() {
      this.accountDialog = null;
      this.accountError = "";
    },
    updateProfile(p, fresh) {
      Object.assign(p, fresh);
    },
    async confirmAccountDialog() {
      const d = this.accountDialog;
      if (!d) return;
      const reason = d.reason.trim();
      if (reason.length < 5) {
        this.accountError = "Please write a reason (at least 5 characters).";
        return;
      }
      const path = { warn: "warnings", deactivate: "deactivate", denyAppeal: "appeal/deny" }[d.mode];
      try {
        const fresh = await api.post(`/accounts/${d.profile.id}/${path}`, { reason });
        const wasActive = !d.profile.deactivated;
        this.updateProfile(d.profile, fresh);
        this.closeAccountDialog();
        if (d.mode === "warn") {
          this.notify(
            fresh.deactivated && wasActive
              ? `Warning ${MAX_WARNINGS} of ${MAX_WARNINGS} reached. Account deactivated`
              : `Warning ${fresh.warnings.length} of ${MAX_WARNINGS} sent`,
          );
        } else {
          this.notify(d.mode === "deactivate" ? "Account deactivated" : "Appeal denied");
        }
      } catch (e) {
        this.accountError = e.message;
      }
    },
    async reactivateAccount(p) {
      try {
        this.updateProfile(p, await api.post(`/accounts/${p.id}/reactivate`));
        this.notify("Account reactivated");
      } catch (e) {
        this.notify(e.message);
      }
    },
    // Resident side: appeal a deactivation, and acknowledge a warning
    async submitAppeal() {
      const message = this.appealText.trim();
      if (message.length < 10) {
        this.notify("Please explain your appeal (at least 10 characters).");
        return;
      }
      try {
        const res = await api.post("/accounts/me/appeal", { message });
        this.resident.appeal = res.appeal;
        this.appealText = "";
        this.notify("Appeal sent to the barangay");
      } catch (e) {
        this.notify(e.message);
      }
    },
    async acknowledgeWarnings() {
      this.warningAck = false;
      this.resident.warnings = this.resident.warnings.map((w) => ({ ...w, seen: true }));
      try {
        await api.post("/accounts/me/warnings/seen");
      } catch (e) {
        this.notify(e.message);
      }
    },

    // Status changes: Rejecting needs a reason (asked in a dialog first). An archived item must be restored
    //                 before its status can change. Reaching a final status archives the item automatically.
    onStatusChange(kind, item, evt) {
      const status = evt.target.value;
      if (item.archived) {
        evt.target.value = item.status;
        this.notify(`Restore this ${kind === "doc" ? "request" : "report"} first to change its status`);
        return;
      }
      if (status === "Rejected") {
        evt.target.value = item.status;
        this.openReject(kind, item);
        return;
      }
      return this.applyStatus(kind, item, status, "", evt);
    },
    openReject(kind, item) {
      this.rejectDialog = { kind, item, reason: "" };
      this.rejectError = "";
      this.$nextTick(() => {
        if (this.$refs.rejectReason) this.$refs.rejectReason.focus();
      });
    },
    closeReject() {
      this.rejectDialog = null;
      this.rejectError = "";
    },
    async confirmReject() {
      const d = this.rejectDialog;
      if (!d) return;
      const reason = d.reason.trim();
      if (reason.length < 5) {
        this.rejectError = "Please enter a reason for the rejection (at least 5 characters).";
        return;
      }
      this.closeReject();
      await this.applyStatus(d.kind, d.item, "Rejected", reason);
    },
    async applyStatus(kind, item, status, reason = "", evt = null) {
      if (item.status === status) return;
      const isDoc = kind === "doc";
      const path = isDoc ? "requests" : "reports";
      const label = isDoc ? "Document request" : "Concern report";
      try {
        const body = status === "Rejected" ? { status, reason } : { status };
        Object.assign(item, await api.patch(`/${path}/${item.id}/status`, body));
      } catch (e) {
        if (evt) evt.target.value = item.status;
        this.notify(e.message);
        return;
      }
      if (!FINAL_STATUS[kind].includes(status) || item.archived) {
        this.notify(isDoc ? "Document request updated" : "Concern report status updated");
        return;
      }
      try {
        Object.assign(item, await api.patch(`/${path}/${item.id}/archive`, { archived: true }));
        if (isDoc) this.docSelected = this.docSelected.filter((id) => id !== item.id);
        else this.reportSelected = this.reportSelected.filter((id) => id !== item.id);
        this.notify(`${label} ${status.toLowerCase()} and moved to Archive`);
      } catch (e) {
        this.notify(`${label} ${status.toLowerCase()}, but it could not be archived: ${e.message}`);
      }
    },
    async toggleArchive(item, kind) {
      const isDoc = kind === "document";
      const label = isDoc ? "Document request" : "Concern report";
      try {
        Object.assign(
          item,
          await api.patch(`/${isDoc ? "requests" : "reports"}/${item.id}/archive`, { archived: !item.archived }),
        );
        this.notify(item.archived ? `${label} archived` : `${label} restored from archive`);
      } catch (e) {
        this.notify(e.message);
      }
    },
    // Bulk selection: tick rows, then archive (or restore) them in one go
    visibleFor(kind) {
      return kind === "doc" ? this.filteredRequests : this.filteredReports;
    },
    selectedFor(kind) {
      return kind === "doc" ? this.docSelected : this.reportSelected;
    },
    allSelected(kind) {
      const rows = this.visibleFor(kind);
      const selected = this.selectedFor(kind);
      return rows.length > 0 && rows.every((r) => selected.includes(r.id));
    },
    toggleAll(kind) {
      const ids = this.allSelected(kind) ? [] : this.visibleFor(kind).map((r) => r.id);
      if (kind === "doc") this.docSelected = ids;
      else this.reportSelected = ids;
    },
    clearSelection(kind) {
      if (kind === "doc") this.docSelected = [];
      else this.reportSelected = [];
    },
    async bulkArchive(kind) {
      const isDoc = kind === "doc";
      const ids = this.selectedFor(kind);
      if (!ids.length) return;
      const archiving = (isDoc ? this.docView : this.reportView) === "active";
      const targets = (isDoc ? this.requests : this.reports).filter((r) => ids.includes(r.id));
      const results = await Promise.allSettled(
        targets.map((r) => api.patch(`/${isDoc ? "requests" : "reports"}/${r.id}/archive`, { archived: archiving })),
      );
      let done = 0;
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          Object.assign(targets[i], res.value);
          done++;
        }
      });
      this.clearSelection(kind);
      const noun = isDoc ? "document request" : "concern report";
      const failed = results.length - done;
      this.notify(
        failed
          ? `${done} ${noun}${done === 1 ? "" : "s"} updated, ${failed} failed. Please try again.`
          : `${done} ${noun}${done === 1 ? "" : "s"} ${archiving ? "archived" : "restored"}`,
      );
    },

    // Announcements & alerts: archive / restore, and inline delete confirmation
    annKey(a) {
      return `${a.kind}-${a.id}`;
    },
    async archiveAnnouncement(a) {
      const isAlert = a.kind === "alert";
      const archiving = !a.archived;
      try {
        const updated = await api.patch(`/${isAlert ? "alerts" : "announcements"}/${a.id}/archive`, {
          archived: archiving,
        });
        const [live, archived] = isAlert ? ["alerts", "archivedAlerts"] : ["posts", "archivedPosts"];
        const [from, to] = archiving ? [live, archived] : [archived, live];
        this[from] = this[from].filter((x) => x.id !== a.id);
        this[to] = [updated, ...this[to]];
        this.notify(archiving ? "Announcement archived" : "Announcement restored");
      } catch (e) {
        this.notify(e.message);
      }
    },
    dismissEmergency() {
      if (!this.me || !this.activeAlert) return;
      this.dismissedAlerts = { ...this.dismissedAlerts, [this.me.id]: this.activeAlert.id };
      saveDismissed(this.dismissedAlerts);
    },
    async publishAnnouncement() {
      const f = this.postForm;
      try {
        if (f.type === "Emergency") {
          this.alerts.unshift(await api.post("/alerts", { title: f.title, body: f.body }));
        } else {
          this.posts.unshift(
            await api.post("/announcements", { title: f.title, type: f.type, body: f.body, date: f.date }),
          );
        }
        this.postForm = blankPost();
        this.showPostForm = false;
        this.notify("Announcement published");
      } catch (e) {
        this.notify(e.message);
      }
    },
    async deleteAnnouncement(a) {
      try {
        if (a.kind === "alert") {
          await api.del(`/alerts/${a.id}`);
          this.alerts = this.alerts.filter((x) => x.id !== a.id);
          this.archivedAlerts = this.archivedAlerts.filter((x) => x.id !== a.id);
        } else {
          await api.del(`/announcements/${a.id}`);
          this.posts = this.posts.filter((x) => x.id !== a.id);
          this.archivedPosts = this.archivedPosts.filter((x) => x.id !== a.id);
        }
        this.notify("Announcement deleted");
      } catch (e) {
        this.notify(e.message);
      } finally {
        this.deletingId = "";
      }
    },
    async saveSettings() {
      try {
        const s = await api.patch(`/barangays/${this.me.brgy_id}`, {
          brgy_name: this.settings.name,
          address: this.settings.address,
          office_hours: this.settings.hours,
        });
        this.settings = { name: s.brgy_name, address: s.address || "", hours: s.office_hours || "" };
        this.notify("Barangay settings saved");
      } catch (e) {
        this.notify(e.message);
      }
    },

    // Modal:
    copyRef() {
      if (navigator.clipboard)
        navigator.clipboard
          .writeText(this.modalRef)
          .then(() => this.notify("Reference copied"))
          .catch(() => this.notify("Reference: " + this.modalRef));
      else this.notify("Reference: " + this.modalRef);
    },
    finishModal() {
      this.modal = "";
      this.page = this.modalNext;
      if (this.page === "track") this.trackSearch();
    },
  },
  mounted() {
    // Landing page "Sign Up" button opens this page with ?mode=signup
    if (new URLSearchParams(location.search).get("mode") === "signup") this.authMode = "signup";
    document.addEventListener("click", (e) => {
      if (this.notifOpen && !e.target.closest(".notif-wrap")) this.notifOpen = false;
      if (this.menuOpen && !e.target.closest(".user-wrap")) this.menuOpen = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Escape first closes the account menu, and does nothing else on that press
      if (this.menuOpen) {
        this.menuOpen = false;
        return;
      }
      this.notifOpen = false;
      if (this.accountDialog) this.closeAccountDialog();
      else if (this.rejectDialog) this.closeReject();
      else if (this.role === "resident" && this.page === "track" && this.trackSearched) this.closeTrack();
    });
    const bar = document.querySelector(".topbar");
    if (bar) {
      const setHeaderHeight = () =>
        document.documentElement.style.setProperty("--header-h", `${bar.offsetHeight}px`);
      setHeaderHeight();
      if (window.ResizeObserver) new ResizeObserver(setHeaderHeight).observe(bar);
      window.addEventListener("resize", setHeaderHeight);
    }
    // Poll every minute (residents: notifications + account standing, staff: the tables).
    // Skipped while the tab is hidden, and refreshed right away when the user comes back.
    setInterval(() => this.refreshLive(), 60000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.refreshLive();
    });
    this.boot();
  },
}).mount("#app");