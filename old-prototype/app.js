const { createApp } = Vue;
const STORAGE_KEY = "kabrgy_dkoalam";
const MIN_PASSWORD = 8;
const todayString = () => new Date().toISOString().slice(0, 10);
const defaultData = () => ({
  session: null,
  superAdmin: { username: "S-Admin", password: "S123" },
  staffAccounts: [
    { id: "STF-1001", name: "Barangay Account", username: "M-Admin", password: "M123" },
  ],
  profiles: [],
  applications: [],
  requests: [],
  reports: [],
  announcements: [
    {
      id: "ANN-1001",
      title: "Welcome to the kaBRGY community portal",
      type: "Announcement",
      date: todayString(),
      body: "Use this portal to stay updated, request barangay services, and report concerns in your community.",
    },
    {
      id: "ANN-1002",
      title: "Barangay office service hours",
      type: "Schedule",
      date: todayString(),
      body: "Residents may visit the barangay hall during regular office hours for on-site verification and other in-person services.",
    },
    {
      id: "ANN-1003",
      title: "Keep emergency contact details updated",
      type: "Announcement",
      date: todayString(),
      body: "Please keep your contact information current so barangay staff can reach you when necessary.",
    },
  ],
  settings: {
    name: "Barangay #",
    address: "Barangay Hall",
    hours: "Monday–Friday, 8:00 AM–5:00 PM",
  },
  notifications: [],
  dismissedEmegencies: {},
});
createApp({
  data() {
    const saved = this.loadData();
    let session = saved.session || null,
      resident = this.blankResident();
    if (session && session.role === "resident") {
      const p = (saved.profiles || []).find((x) =>
        this.sameEmail(x.email, session.email),
      );
      if (p) resident = this.publicProfile(p);
      else session = null;
    } else if (session && session.role !== "admin") session = null;
    else if (
      session &&
      !session.super &&
      session.staffId &&
      !(saved.staffAccounts || []).some((s) => s.id === session.staffId)
    )
      session = null;
    return {
      ...saved,
      session,
      resident,
      authView: "resident",
      authMode: "login",
      authError: "",
      loginForm: { email: "", password: "" },
      signupForm: { name: "", email: "", password: "", confirm: "" },
      modTab: "staff",
      modSearch: "",
      modDialog: null,
      modError: "",
      applyDialog: null,
      applyError: "",
      appView: "pending",
      appSearch: "",
      decisionDialog: null,
      decisionError: "",
      appDeleteId: "",
      photoError: "",
      residentView: "",
      lastRaw: "",
      syncTimer: null,
      createDialog: null,
      createError: "",
      pwForm: { current: "", next: "", confirm: "", show: false },
      pwError: "",
      minPassword: MIN_PASSWORD,
      forcePw: { next: "", confirm: "", show: false },
      forcePwError: "",
      adminProfile: { name: "", address: "", contact: "" },
      copied: false,
      appRevealed: {},
      appCopied: "",
      copyTimer: null,
      warnDialog: null,
      page: "home",
      adminPage: "overview",
      sidebarCollapsed: (() => {
        try { return localStorage.getItem("kabrgy-sidebar") === "1"; } catch (e) { return false; }
      })(),
      annTypeFilter: "All",
      announcementFilter: "All",
      requestFilter: "All",
      reportFilter: "All",
      documentForm: {
        types: [],
        purpose: "",
        date: "",
        time: "",
        contact: "",
        province: "",
        municipality: "",
        barangay: "",
      },
      reportForm: {
        category: "",
        location: "",
        description: "",
        name: "",
        contact: "",
        province: "",
        municipality: "",
        barangay: "",
      },
      verifSearch: "",
      verifFilter: "all",
      docSearch: "",
      reportSearch: "",
      docView: "active",
      reportView: "active",
      annView: "active",
      deletingId: "",
      docSelected: [],
      reportSelected: [],
      postForm: {
        title: "",
        type: "Announcement",
        body: "",
        date: todayString(),
      },
      trackId: "",
      trackSearched: false,
      docStatusFilter: "All",
      reportStatusFilter: "All",
      docExpanded: false,
      reportExpanded: false,
      trackLimit: 3,
      rejectDialog: null,
      accountDialog: null,
      accountError: "",
      appealText: "",
      warningAck: false,
      rejectError: "",
      modal: "",
      modalTitle: "",
      modalMessage: "",
      modalRef: "",
      notifOpen: false,
      notifShowAll: false,
      presence: {},
      presenceNow: Date.now(),
      presenceTimer: null,
      modalNext: "home",
      toast: "",
      showPostForm: false,
    };
  },
  computed: {
    today() {
      return todayString();
    }, 
    /* all document typ */
    documentTypes() {
      return [
        "Barangay Clearance",
        "Certificate of Residency",
        "Certificate of Indigency",
        "Barangay Business Clearance",
        "Other Barangay Certificate",
      ];
    },
    /* document limitations per brgy. */
    docLimit() {
      return this.docLimitFor(this.documentForm.barangay);
    },
    role() {
      return this.session ? this.session.role : null;
    },
    publicAnnouncements() {
      return this.announcements.filter((a) => !a.archived);
    },
    archivedAnnouncements() {
      return this.announcements.filter((a) => a.archived);
    },
    adminAnnouncements() {
      const list =
        this.annView === "archived"
          ? this.archivedAnnouncements
          : this.publicAnnouncements;
      return list.filter(
        (a) => this.annTypeFilter === "All" || a.type === this.annTypeFilter,
      );
    },
    recentAdminAnnouncements() {
      return this.publicAnnouncements
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);
    },
    recentProfiles() {
      return this.activeProfiles.slice(0, 5);
    },
    /* warning history (admin and super admin) */
    warnProfile() {
      return this.warnDialog
        ? this.profiles.find((p) => this.sameEmail(p.email, this.warnDialog.email)) || null
        : null;
    },
    residentViewProfile() {
      return this.residentView
        ? this.profiles.find((p) => this.sameEmail(p.email, this.residentView)) || null
        : null;
    },
    /* super admin */
    isSuper() {
      return !!(this.session && this.session.role === "admin" && this.session.super);
    },
    /* staff applications only the super admin can see */
    pendingApplications() {
      return this.isSuper
        ? (this.applications || []).filter((a) => a.status === "Pending")
        : [];
    },
    appViewStatus() {
      return (
        { pending: "Pending", approved: "Approved", rejected: "Rejected", removed: "Removed" }[
          this.appView
        ] || "Pending"
      );
    },
    appCounts() {
      const c = { pending: 0, approved: 0, rejected: 0, removed: 0, all: 0 };
      if (!this.isSuper) return c;
      (this.applications || []).forEach((a) => {
        c.all++;
        const k = (a.status || "").toLowerCase();
        if (k in c) c[k]++;
      });
      return c;
    },
    modApplications() {
      if (!this.isSuper) return [];
      return (this.applications || [])
        .filter((a) =>
          this.appView === "all"
            ? true
            : a.status === this.appViewStatus,
        )
        .filter((a) =>
          this.matches(this.appSearch, [a.name, a.email, a.brgyId, a.contact, a.id]),
        )
        .slice()
        .reverse();
    },
    myApplication() {
      const email = this.resident.email;
      const mine = (this.applications || []).filter((a) =>
        this.sameEmail(a.accountEmail, email),
      );
      return mine.length ? mine[mine.length - 1] : null;
    },
    modStaff() {
      return this.staffAccounts.filter((s) =>
        this.matches(this.modSearch, [s.username, s.name]),
      );
    },
    modResidents() {
      return this.profiles.filter((p) =>
        this.matches(this.modSearch, [p.email, p.name]),
      );
    },
    /* account moderation */
    maxWarnings() {
      return 3;
    },
    activeProfiles() {
      return this.profiles.filter((p) => !p.deactivated);
    },
    deactivatedProfiles() {
      return this.profiles.filter((p) => p.deactivated);
    },
    pendingAppeals() {
      return this.deactivatedProfiles.filter(
        (p) => p.appeal && p.appeal.status === "Pending",
      );
    },
    emergencyCount() {
      return this.publicAnnouncements.filter((a) => a.type === "Emergency").length;
    },
    latestAnnouncements() {
      return this.publicAnnouncements
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
    },
    activeAlert() {
      return (
        this.publicAnnouncements.find((a) => a.type === "Emergency") || null
      );
    },

    emergencyDismissed() { /* dismissed emergency */
      const email = (this.resident.email || "").toLowerCase();
      const alertId = this.activeAlert && this.activeAlert.id;
      return !!(
        email &&
        alertId &&
        this.dismissedEmergencies &&
        this.dismissedEmergencies[email] === alertId
      );
    },

    residentRequests() {
      return this.requests.filter((r) =>
        this.sameEmail(r.email, this.resident.email),
      );
    },
    residentReports() {
      return this.reports.filter((r) =>
        this.sameEmail(r.email, this.resident.email),
      );
    },
    /* per-resident limit*/
    maxActiveRequests() {
      return 3;
    },
    activeDocCount() {
      const live = ["Pending", "Approved", "Ready for Pickup"];
      return this.residentRequests.filter((r) => live.includes(r.status)).length;
    },
    activeReportCount() {
      const live = ["Submitted", "Received", "In Progress"];
      return this.residentReports.filter((r) => live.includes(r.status)).length;
    },
    docLimitReached() {
      return this.activeDocCount >= this.maxActiveRequests;
    },
    reportLimitReached() {
      return this.activeReportCount >= this.maxActiveRequests;
    },
    residentNotifications() {
      return this.notifications
        .filter((n) => this.sameEmail(n.email, this.resident.email))
        .slice()
        .sort((a, b) => (b.created || b.id) - (a.created || a.id));
    },
    unreadCount() {
      return this.residentNotifications.filter((n) => !n.read).length;
    },
    /* "See all the previous notif */
    notifPreviewLimit() {
      return 5;
    },
    visibleNotifications() {
      return this.notifShowAll
        ? this.residentNotifications
        : this.residentNotifications.slice(0, this.notifPreviewLimit);
    },
    hasMoreNotifications() {
      return this.residentNotifications.length > this.notifPreviewLimit;
    },
    onlineStaffCount() {
      return this.staffAccounts.filter((s) => this.staffOnline(s)).length;
    },
    onlineResidentCount() {
      return this.profiles.filter((p) => this.residentOnline(p.email)).length;
    },
    filteredAnnouncements() {
      return this.publicAnnouncements
        .filter(
          (a) =>
            this.announcementFilter === "All" ||
            a.type === this.announcementFilter,
        )
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));
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
      return base.filter((p) =>
        this.matches(this.verifSearch, [p.email, p.name, p.address]),
      );
    },
    filteredRequests() {
      const list =
        this.docView === "archived" ? this.archivedRequests : this.activeRequests;
      return list.filter(
        (r) =>
          (this.requestFilter === "All" || r.status === this.requestFilter) &&
          this.matches(this.docSearch, [r.email, r.name, r.id]),
      );
    },
    filteredReports() {
      const list =
        this.reportView === "archived" ? this.archivedReports : this.activeReports;
      return list.filter(
        (r) =>
          (this.reportFilter === "All" ||
            (this.reportFilter === "Open"
              ? r.status !== "Resolved"
              : r.status === this.reportFilter)) &&
          this.matches(this.reportSearch, [r.email, r.name, r.id]),
      );
    },
    /* track request */
    trackedItem() {
      const key = this.trackId.trim().toLowerCase();
      if (!key) return null;
      const doc = this.residentRequests.find((r) => r.id.toLowerCase() === key);
      if (doc) return { kind: "document", data: doc };
      const rep = this.residentReports.find((r) => r.id.toLowerCase() === key);
      if (rep) return { kind: "report", data: rep };
      return null;
    },
    documentStatuses() {
      return ["Pending", "Approved", "Ready for Pickup", "Completed"];
    },
    reportStatuses() {
      return ["Submitted", "Received", "In Progress", "Resolved"];
    },
    /* track status see all or see less */
    barangayChoices() {
      return [
        { value: "Barangay 1", label: "Barangay 1 (San Pablo)" },
        { value: "Barangay 2", label: "Barangay 2 (San Jose)" },
        { value: "Barangay 3", label: "Barangay 3 (San Jose)" },
        { value: "Barangay 4", label: "Barangay 4 (J.M. Loyola – seat of government)" },
        { value: "Barangay 5", label: "Barangay 5 (J.M. Loyola)" },
        { value: "Barangay 6", label: "Barangay 6 (Magallanes)" },
        { value: "Barangay 7", label: "Barangay 7 (Magallanes)" },
        { value: "Barangay 8", label: "Barangay 8 (Rosario)" },
        { value: "Barangay Maduya", label: "Maduya (Barangay 9)" },
        { value: "Barangay Cabilang Baybay", label: "Cabilang Baybay (Barangay 10)" },
        { value: "Barangay Mabuhay", label: "Mabuhay (Barangay 11)" },
        { value: "Barangay Milagrosa", label: "Milagrosa (Barangay 12)" },
        { value: "Barangay Lantic", label: "Lantic (Barangay 13)" },
        { value: "Barangay Bancal", label: "Bancal (Barangay 14)" },
      ];
    },
    isKnownBarangay() {
      return this.barangayChoices.some((b) => b.value === this.settings.name);
    },
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
    currentStaff() {
      return this.session && this.session.staffId
        ? this.staffAccounts.find((s) => s.id === this.session.staffId) || null
        : null;
    },
    /* staff account created / reset by the Super Admin still has its temporary password */
    mustChangePassword() {
      return !!(
        this.session &&
        this.session.role === "admin" &&
        !this.session.super &&
        this.currentStaff &&
        this.currentStaff.passwordChanged === false
      );
    },
    adminAccountName() {
      if (this.isSuper) return this.superAdmin.name || "Super Admin";
      return (this.currentStaff && this.currentStaff.name) || "Barangay Account";
    },
    adminAccountLogin() {
      if (this.isSuper) return this.superAdmin.username;
      return this.currentStaff ? this.currentStaff.username : "";
    },
    adminTitle() {
      return {
        myaccount: "My account",
        overview: "Official dashboard",
        verifications: "Resident verification",
        accounts: "Account modification",
        documents: "Document requests",
        reports: "Concern reports",
        posts: "Announcements & alerts",
        settings: "Barangay settings",
      }[this.adminPage];
    },
    adminLabel() {
      return {
        myaccount: "YOUR ACCOUNT",
        overview: "OVERVIEW",
        verifications: "RESIDENT RECORDS",
        accounts: "ACCOUNT CONTROL",
        documents: "SERVICE MANAGEMENT",
        reports: "COMMUNITY CONCERNS",
        posts: "PUBLIC INFORMATION",
        settings: "CONFIGURATION",
      }[this.adminPage];
    },
  },
  watch: {
    "documentForm.barangay"() {
      const max = this.docLimit;
      if (this.documentForm.types.length > max) {
        this.documentForm.types = this.documentForm.types.slice(0, max);
        if (max)
          this.notify(
            `${this.documentForm.barangay} allows up 1 to ${max} documents per request. Your selection was trimmed.`,
          );
      }
    },
    docStatusFilter() { this.docExpanded = false; },
    reportStatusFilter() { this.reportExpanded = false; },
    docView() { this.docSelected = []; },
    requestFilter() { this.docSelected = []; },
    docSearch() { this.docSelected = []; },
    reportView() { this.reportSelected = []; },
    reportFilter() { this.reportSelected = []; },
    reportSearch() { this.reportSelected = []; },
    adminPage(v) {
      this.docSelected = [];
      this.reportSelected = [];
      this.pwReset();
      if (v === "myaccount") this.loadAdminProfile();
    },
    "createDialog.name"() { this.autoCreatePassword(); },
    "createDialog.username"() { this.autoCreatePassword(); },
    notifOpen(open) { if (!open) this.notifShowAll = false; },
    session(now, before) {
      if (before) this.presenceClear(this.presenceKeyFor(before));
      this.presenceBeat();
    },
  },
  methods: {
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
      this.verifSearch = "";
      this.docSearch = "";
      this.reportSearch = "";
      t[1]();
      this.adminPage = t[0];
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      try { localStorage.setItem("kabrgy-sidebar", this.sidebarCollapsed ? "1" : "0"); } catch (e) {}
    },
    /* Barangay 1-8 : 2 documents per request tas yung brgy 9-14 : 3 documents per request */
    docLimitFor(b) {
      if (!b) return 0;
      return /^Barangay [1-8]$/.test(b) ? 2 : 3;
    },
    loadData() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        const data = { ...defaultData(), ...saved };
        if (!Array.isArray(data.applications)) data.applications = [];
        /* saved data */
        if (!saved.staffAccounts && saved.admin) {
          data.staffAccounts = [
            {
              id: "STF-1001",
              name: "Barangay Account",
              username: saved.admin.username,
              password: saved.admin.password,
            },
          ];
        }
        return data;
      } catch (e) {
        return defaultData();
      }
    },
    persist() {
      const payload = JSON.stringify({
          session: this.session,
          superAdmin: this.superAdmin,
          staffAccounts: this.staffAccounts,
          profiles: this.profiles,
          applications: this.applications,
          requests: this.requests,
          reports: this.reports,
          announcements: this.announcements,
          settings: this.settings,
          notifications: this.notifications,
          dismissedEmergencies: this.dismissedEmergencies,
      });
      localStorage.setItem(STORAGE_KEY, payload);
      this.lastRaw = payload;
    },
    /* live updates */
    syncFromStorage() {
      let raw = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        return;
      }
      if (!raw || raw === this.lastRaw) return;
      let saved;
      try {
        saved = JSON.parse(raw);
      } catch (e) {
        return;
      }
      this.lastRaw = raw;
      if (!saved || typeof saved !== "object") return;
      const before = {
        requests: (this.requests || []).length,
        reports: (this.reports || []).length,
        profiles: (this.profiles || []).length,
        applications: (this.applications || []).length,
      };
      const keys = [
        "superAdmin",
        "staffAccounts",
        "profiles",
        "applications",
        "requests",
        "reports",
        "announcements",
        "settings",
        "notifications",
        "dismissedEmergencies",
      ];
      keys.forEach((k) => {
        if (saved[k] === undefined || saved[k] === null) return;
        if (JSON.stringify(saved[k]) !== JSON.stringify(this[k])) this[k] = saved[k];
      });
      if (!this.session) return;
      if (this.session.role === "resident") {
        const p = this.profiles.find((x) => this.sameEmail(x.email, this.session.email));
        if (!p) {
          this.logout();
          this.authError = "This account is no longer available.";
          return;
        }
        const fresh = this.publicProfile(p);
        ["photo", "verified", "deactivated", "deactivationReason", "deactivatedAt", "warnings", "appeal"].forEach(
          (k) => {
            if (JSON.stringify(fresh[k]) !== JSON.stringify(this.resident[k]))
              this.resident[k] = fresh[k];
          },
        );
        if (!fresh.deactivated && fresh.warnings.some((w) => !w.seen)) this.warningAck = true;
        return;
      }
      /* staff account deleted by the Super Admin while logged in */
      if (
        this.session.role === "admin" &&
        !this.session.super &&
        this.session.staffId &&
        !this.staffAccounts.some((s) => s.id === this.session.staffId)
      ) {
        this.logout();
        this.authError = "Your staff account was removed by the Super Admin.";
        return;
      }
      /* notif when something new arrives for staff */
      if (this.session.role === "admin") {
        const msgs = [];
        if (this.requests.length > before.requests) msgs.push("New document request received");
        if (this.reports.length > before.reports) msgs.push("New concern report received");
        if (this.profiles.length > before.profiles) msgs.push("New resident account registered");
        if (this.isSuper && this.applications.length > before.applications)
          msgs.push("New staff application received");
        if (msgs.length) this.notify(msgs[0] + (msgs.length > 1 ? ` (+${msgs.length - 1} more)` : ""));
      }
    },
    saveAll() {
      this.persist();
    },
    sameEmail(a, b) {
      return !!a && !!b && a.toLowerCase() === b.toLowerCase();
    },
    id(prefix, arr) {
      let n = 1001;
      while (arr.some((x) => x.id === `${prefix}-${n}`)) n++;
      return `${prefix}-${n}`;
    },
    formatDate(d) {
      if (!d) return "Date not set";
      const x = new Date(`${d}T12:00:00`);
      return x.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    },
    day(d) {
      return d ? new Date(`${d}T12:00:00`).getDate() : "—";
    },
    month(d) {
      return d
        ? new Date(`${d}T12:00:00`)
            .toLocaleDateString("en-PH", { month: "short" })
            .toUpperCase()
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
          Removed: "status-rejected",
        }[s] || "status-pending"
      );
    },
    statusIndex(s) {
      return this.reportStatuses.indexOf(s);
    },
    docStatusIndex(s) {
      return this.documentStatuses.indexOf(s);
    },
    matches(query, fields) {
      const q = (query || "").trim().toLowerCase();
      if (!q) return true;
      return fields.some((f) => (f || "").toLowerCase().includes(q));
    },
    blankResident() {
      return {
        name: "",
        email: "",
        address: "",
        contact: "",
        photo: "",
        verified: false,
        deactivated: false,
        deactivationReason: "",
        deactivatedAt: "",
        warnings: [],
        appeal: null,
      };
    },
    publicProfile(p) {
      return {
        name: p.name || "",
        email: p.email,
        address: p.address || "",
        contact: p.contact || "",
        photo: p.photo || "",
        verified: !!p.verified,
        deactivated: !!p.deactivated,
        deactivationReason: p.deactivationReason || "",
        deactivatedAt: p.deactivatedAt || "",
        warnings: (p.warnings || []).map((w) => ({ ...w })),
        appeal: p.appeal ? { ...p.appeal } : null,
      };
    },
    setAuthView(v) {
      this.authView = v;
      this.authError = "";
    },
    setAuthMode(m) {
      this.authMode = m;
      this.authError = "";
    },
    startResident(p) {
      this.resident = this.publicProfile(p);
      this.session = { role: "resident", email: p.email };
      this.page = "home";
      this.reportForm.name = this.resident.name;
      this.documentForm.contact = this.resident.contact;
      this.loginForm = { email: "", password: "" };
      this.signupForm = { name: "", email: "", password: "", confirm: "" };
      this.authError = "";
      this.appealText = "";
      this.warningAck =
        !this.resident.deactivated &&
        this.resident.warnings.some((w) => !w.seen);
      this.persist();
      window.scrollTo({ top: 0 });
      this.notify(
        "Welcome, " + (this.resident.name || "resident").split(" ")[0],
      );
    },
    /* replace a profile */
    updateProfile(email, patch) {
      const i = this.profiles.findIndex((x) => this.sameEmail(x.email, email));
      if (i < 0) return null;
      const next = { ...this.profiles[i], ...patch };
      this.profiles.splice(i, 1, next);
      if (this.sameEmail(email, this.resident.email))
        this.resident = this.publicProfile(next);
      return next;
    },
    openAccountDialog(mode, p) {
      this.accountDialog = { mode, profile: p, reason: "" };
      this.accountError = "";
    },
    closeAccountDialog() {
      this.accountDialog = null;
      this.accountError = "";
    },
    confirmAccountDialog() {
      const d = this.accountDialog;
      if (!d) return;
      const reason = d.reason.trim();
      if (reason.length < 5) {
        this.accountError = "Please write a reason (at least 5 characters).";
        return;
      }
      const p = d.profile;
      if (d.mode === "warn") this.issueWarning(p, reason);
      else if (d.mode === "deactivate") this.deactivateAccount(p, reason);
      else if (d.mode === "denyAppeal") this.denyAppeal(p, reason);
      this.closeAccountDialog();
    },
    issueWarning(p, reason) {
      const warnings = [
        ...(p.warnings || []),
        {
          id: `W-${Date.now()}`,
          reason,
          date: todayString(),
          seen: false,
        },
      ];
      const n = warnings.length;
      this.updateProfile(p.email, { warnings });
      if (n >= this.maxWarnings) {
        this.deactivateAccount(
          { ...p, warnings },
          `Reached ${this.maxWarnings} of ${this.maxWarnings} warnings. Latest warning: ${reason}`,
          true,
        );
        return;
      }
      this.pushNotification(
        p.email,
        `Account warning ${n} of ${this.maxWarnings}`,
        `${reason} — ${this.maxWarnings - n} more warning(s) will deactivate your account.`,
        "account",
        "",
      );
      this.persist();
      this.notify(`Warning ${n} of ${this.maxWarnings} sent`);
    },
    deactivateAccount(p, reason, auto) {
      this.updateProfile(p.email, {
        deactivated: true,
        deactivationReason: reason,
        deactivatedAt: todayString(),
        appeal: null,
      });
      this.pushNotification(
        p.email,
        "Account deactivated",
        reason,
        "account",
        "",
      );
      this.persist();
      this.notify(
        auto
          ? "3rd warning reached — account deactivated"
          : "Account deactivated",
      );
    },
    reactivateAccount(p) {
      this.updateProfile(p.email, {
        deactivated: false,
        deactivationReason: "",
        deactivatedAt: "",
        warnings: [],
        appeal: null,
      });
      this.pushNotification(
        p.email,
        "Account reactivated",
        "Your resident account has been restored and your warnings were cleared. Please follow the barangay rules.",
        "account",
        "",
      );
      this.persist();
      this.notify("Account reactivated");
    },
    denyAppeal(p, reason) {
      this.updateProfile(p.email, {
        appeal: {
          ...(p.appeal || {}),
          status: "Denied",
          response: reason,
          respondedAt: todayString(),
        },
      });
      this.pushNotification(
        p.email,
        "Appeal denied",
        reason,
        "account",
        "",
      );
      this.persist();
      this.notify("Appeal denied");
    },
    /* resident side */
    submitAppeal() {
      const message = this.appealText.trim();
      if (message.length < 10) {
        this.notify("Please explain your appeal (at least 10 characters).");
        return;
      }
      this.updateProfile(this.resident.email, {
        appeal: { message, date: todayString(), status: "Pending" },
      });
      this.appealText = "";
      this.persist();
      this.notify("Appeal sent to the barangay");
    },
    acknowledgeWarnings() {
      const warnings = (
        (this.profiles.find((x) =>
          this.sameEmail(x.email, this.resident.email),
        ) || {}).warnings || []
      ).map((w) => ({ ...w, seen: true }));
      this.updateProfile(this.resident.email, { warnings });
      this.warningAck = false;
      this.persist();
    },
    /* resident login */
    loginResident() {
      if (this.tryStaffLogin(this.loginForm.email, this.loginForm.password))
        return;
      const p = this.profiles.find((x) =>
        this.sameEmail(x.email, this.loginForm.email.trim()),
      );
      if (!p) {
        this.authError =
          "No resident account uses that email. Create an account first.";
        return;
      }
      if (!p.password) {
        this.authError =
          "This profile was saved before accounts existed. Choose Create a resident account with the same email to set a password.";
        return;
      }
      if (p.password !== this.loginForm.password) {
        this.authError = "Incorrect password. Try again.";
        return;
      }
      this.startResident(p);
    },
    /* signup ng resident */
    signUpResident() {
      const f = this.signupForm,
        email = f.email.trim();
      if (f.password.length < MIN_PASSWORD) {
        this.authError = `Use a password with at least ${MIN_PASSWORD} characters.`;
        return;
      }
      if (f.password !== f.confirm) {
        this.authError = "The two passwords do not match.";
        return;
      }
      const i = this.profiles.findIndex((x) => this.sameEmail(x.email, email));
      if (i >= 0 && this.profiles[i].password) {
        this.authError =
          "An account with this email already exists. Log in instead.";
        return;
      }
      let p;
      if (i >= 0) {
        p = {
          ...this.profiles[i],
          name: f.name.trim() || this.profiles[i].name,
          password: f.password,
        };
        this.profiles.splice(i, 1, p);
      } else {
        p = {
          name: f.name.trim(),
          email,
          address: "",
          contact: "",
          verified: false,
          password: f.password,
        };
        this.profiles.unshift(p);
      }
      this.startResident(p);
    },
    /* staff / super admin login ) */
    tryStaffLogin(identifier, password) {
      const username = identifier.trim().toLowerCase();
      if (username === this.superAdmin.username.toLowerCase()) {
        if (password !== this.superAdmin.password) {
          this.authError = "Incorrect username or password.";
          return true;
        }
        this.session = { role: "admin", super: true };
        this.notify("Logged in as super admin");
      } else {
        const s = this.staffAccounts.find(
          (x) => x.username.toLowerCase() === username,
        );
        if (!s) return false;
        if (password !== s.password) {
          this.authError = "Incorrect username or password.";
          return true;
        }
        this.session = { role: "admin", staffId: s.id };
        this.notify("Logged in as admin");
      }
      this.adminPage = "overview";
      this.loginForm = { email: "", password: "" };
      this.authError = "";
      this.persist();
      window.scrollTo({ top: 0 });
      return true;
    },
    /* full account details of resident */
    openResidentView(p) {
      if (this.role !== "admin" || !p) return;
      this.residentView = p.email;
    },
    closeResidentView() {
      this.residentView = "";
    },
    rowOpenResident(e, p) {
      if (e && e.target && e.target.closest("button, a, input, select, label")) return;
      this.openResidentView(p);
    },
    /* warning history*/
    openWarnDialog(p) {
      this.warnDialog = { email: p.email, confirmId: "" };
    },
    closeWarnDialog() {
      this.warnDialog = null;
    },
    deleteWarning(w) {
      const p = this.warnProfile;
      if (!p) return;
      const warnings = (p.warnings || []).filter((x) => x.id !== w.id);
      this.updateProfile(p.email, { warnings });
      this.pushNotification(
        p.email,
        "Warning removed",
        `A mistaken warning was removed from your account. You now have ${warnings.length} of ${this.maxWarnings} warnings.`,
        "account",
        "",
      );
      this.warnDialog.confirmId = "";
      this.persist();
      this.notify("Warning deleted");
    },
    /* copy da default password after ma factory reset */
    copyTempPassword() {
      const d = this.modDialog;
      if (!d || !d.temp) return;
      const done = () => {
        this.copied = true;
        clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => (this.copied = false), 2000);
      };
      const fallback = () => {
        const t = document.createElement("textarea");
        t.value = d.temp;
        t.setAttribute("readonly", "");
        t.style.position = "fixed";
        t.style.opacity = "0";
        document.body.appendChild(t);
        t.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(t);
        if (ok) done();
        else this.notify("Couldn't copy. Select the password and copy it manually.");
      };
      if (navigator.clipboard && window.isSecureContext)
        navigator.clipboard.writeText(d.temp).then(done, fallback);
      else fallback();
    },
    /* account modification (super admin lng) */
    generateTempPassword() {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      const bytes = new Uint32Array(8);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => chars[b % chars.length]).join("");
    },
    openModDialog(mode, kind, account) {
      if (!this.isSuper) return;
      this.modDialog = { mode, kind, account, ack: false, done: false, temp: "", reason: "" };
      this.modError = "";
    },
    closeModDialog() {
      this.modDialog = null;
      this.copied = false;
      this.modError = "";
    },
    confirmModDialog() {
      const d = this.modDialog;
      if (!d || !this.isSuper || d.done) return;
      if (!d.ack) {
        this.modError = "Please tick the box to confirm you understand.";
        return;
      }
      const a = d.account;
      if (d.mode === "reset") {
        const temp = this.generateTempPassword();
        if (d.kind === "staff") {
          const i = this.staffAccounts.findIndex((s) => s.id === a.id);
          if (i < 0) {
            this.modError = "That account no longer exists.";
            return;
          }
          this.staffAccounts.splice(i, 1, { ...this.staffAccounts[i], password: temp, passwordChanged: false });
        } else {
          if (!this.updateProfile(a.email, { password: temp })) {
            this.modError = "That account no longer exists.";
            return;
          }
          this.pushNotification(
            a.email,
            "Password reset",
            "The barangay reset your account password. Please contact the barangay office for your temporary password.",
            "account",
            "",
          );
        }
        d.temp = temp;
        d.done = true;
        this.modError = "";
        this.persist();
        this.notify("Password reset");
        return;
      }
      if (d.kind === "staff") {
        const linked = this.linkedApplication(a);
        const reason = (d.reason || "").trim();
        if (linked && reason.length < 5) {
          this.modError =
            "Give a reason for deleting this account (at least 5 characters). The resident will see it.";
          return;
        }
        this.staffAccounts = this.staffAccounts.filter((s) => s.id !== a.id);
        if (linked) {
          const i = this.applications.findIndex((x) => x.id === linked.id);
          this.applications.splice(i, 1, {
            ...linked,
            status: "Removed",
            removedReason: reason,
            removedAt: todayString(),
          });
          this.pushNotification(
            linked.accountEmail,
            "Staff account deleted",
            `Your staff account (${a.username}) was deleted by the Super Admin. Reason: ${reason} You may apply again from the home page.`,
            "application",
            "",
          );
        }
      } else {
        this.profiles = this.profiles.filter((p) => !this.sameEmail(p.email, a.email));
        this.notifications = this.notifications.filter((n) => !this.sameEmail(n.email, a.email));
      }
      this.persist();
      this.closeModDialog();
      this.notify("Account deleted");
    },
    /* Staff application */
    linkedApplication(staff) {
      if (!staff) return null;
      return (
        (this.applications || []).find(
          (x) =>
            x.status === "Approved" &&
            x.staffUsername &&
            x.staffUsername.toLowerCase() === (staff.username || "").toLowerCase(),
        ) || null
      );
    },
    openApplyDialog() {
      if (this.role !== "resident") return;
      const mine = this.myApplication;
      if (mine && mine.status === "Pending") {
        this.notify("You already have an application waiting for review.");
        return;
      }
      if (mine && mine.status === "Approved") {
        this.notify("Your application was already approved.");
        return;
      }
      this.applyDialog = {
        name: this.resident.name || "",
        email: this.resident.email || "",
        brgyId: "",
        contact: this.resident.contact || "",
        purpose: "",
      };
      this.applyError = "";
    },
    closeApplyDialog() {
      this.applyDialog = null;
      this.applyError = "";
    },
    submitApplication() {
      const d = this.applyDialog;
      if (!d || this.role !== "resident") return;
      const name = d.name.trim(),
        email = d.email.trim(),
        brgyId = d.brgyId.trim(),
        contact = d.contact.trim(),
        purpose = d.purpose.trim();
      if (name.length < 3) {
        this.applyError = "Enter your full name.";
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        this.applyError = "Enter a valid email address.";
        return;
      }
      if (!/^[A-Za-z0-9-]{3,25}$/.test(brgyId)) {
        this.applyError =
          "Enter your Brgy ID number (3-25 letters, numbers or dashes).";
        return;
      }
      if (!/^[0-9+\-\s()]{7,15}$/.test(contact)) {
        this.applyError = "Enter a valid contact number.";
        return;
      }
      if (purpose.length < 15) {
        this.applyError =
          "Tell us your purpose of application (at least 15 characters).";
        return;
      }
      const mine = this.myApplication;
      if (mine && (mine.status === "Pending" || mine.status === "Approved")) {
        this.applyError = "You already have an application on file.";
        return;
      }
      this.applications.push({
        id: this.id("APP", this.applications),
        accountEmail: this.resident.email,
        name,
        email,
        brgyId,
        contact,
        purpose,
        status: "Pending",
        submitted: todayString(),
        decided: "",
        reason: "",
        staffUsername: "",
      });
      this.persist();
      this.closeApplyDialog();
      this.notify("Application sent to the Super Admin");
    },
    appStaff(app) {
      if (!app || !app.staffUsername) return null;
      return (
        this.staffAccounts.find(
          (s) => s.username.toLowerCase() === app.staffUsername.toLowerCase(),
        ) || null
      );
    },
    /* Super Admin approved application */
    approveApplication(app) {
      if (!this.isSuper) return;
      const i = this.applications.findIndex((a) => a.id === app.id);
      if (i < 0) return;
      const cur = this.applications[i];
      if (cur.status === "Approved" || cur.status === "Removed") return;
      this.applications.splice(i, 1, {
        ...cur,
        status: "Approved",
        reason: "",
        decided: todayString(),
        staffUsername: "",
        staffId: "",
      });
      this.pushNotification(
        cur.accountEmail,
        "Staff application approved",
        "Congratulations! Your application was approved. The Super Admin will create your staff account and send your login details to your registered email.",
        "application",
        "",
      );
      this.persist();
      this.notify("Application approved. You can now create the staff account.");
    },
    openDecisionDialog(app) {
      if (!this.isSuper || (app.status !== "Pending" && app.status !== "Approved")) return;
      this.decisionDialog = { app, reason: "" };
      this.decisionError = "";
    },
    closeDecisionDialog() {
      this.decisionDialog = null;
      this.decisionError = "";
    },
    /* reject (also used to change an Approved application to Rejected) */
    confirmDecision() {
      const d = this.decisionDialog;
      if (!d || !this.isSuper) return;
      const i = this.applications.findIndex((a) => a.id === d.app.id);
      if (i < 0) {
        this.decisionError = "This application no longer exists.";
        return;
      }
      const app = this.applications[i];
      if (app.status !== "Pending" && app.status !== "Approved") {
        this.decisionError = "This application can't be changed.";
        return;
      }
      const reason = d.reason.trim();
      if (reason.length < 5) {
        this.decisionError = "Give a reason (at least 5 characters). The applicant will see it.";
        return;
      }
      const wasApproved = app.status === "Approved";
      if (wasApproved) {
        const staff = this.appStaff(app);
        if (staff) this.staffAccounts = this.staffAccounts.filter((s) => s.id !== staff.id);
      }
      this.applications.splice(i, 1, {
        ...app,
        status: "Rejected",
        reason,
        decided: todayString(),
        staffUsername: "",
        staffId: "",
      });
      this.pushNotification(
        app.accountEmail,
        "Staff application not approved",
        wasApproved
          ? `Your application status was changed to not approved and your staff account was removed. Reason: ${reason}`
          : `Your application was not approved. Reason: ${reason}`,
        "application",
        "",
      );
      this.persist();
      this.closeDecisionDialog();
      this.notify("Application rejected");
    },
    /* delete a rejected application (super admin lng). The resident can apply again after this */
    askDeleteApplication(app) {
      if (!this.isSuper || !app || app.status !== "Rejected") return;
      this.appDeleteId = app.id;
    },
    cancelDeleteApplication() {
      this.appDeleteId = "";
    },
    deleteApplication(app) {
      if (!this.isSuper || !app) return;
      const i = this.applications.findIndex((a) => a.id === app.id);
      if (i < 0) {
        this.appDeleteId = "";
        return;
      }
      const cur = this.applications[i];
      /* only rejected applications can be deleted */
      if (cur.status !== "Rejected") {
        this.appDeleteId = "";
        this.notify("Only rejected applications can be deleted.");
        return;
      }
      this.applications.splice(i, 1);
      this.pushNotification(
        cur.accountEmail,
        "Staff application removed",
        "Your rejected staff application was deleted by the Super Admin. You may apply again from the home page.",
        "application",
        "",
      );
      this.appDeleteId = "";
      this.persist();
      this.notify("Rejected application deleted");
    },
    toggleReveal(id) {
      this.appRevealed = { ...this.appRevealed, [id]: !this.appRevealed[id] };
    },
    copyAppPassword(app) {
      const staff = this.appStaff(app);
      if (!staff) return;
      this.copyText(staff.password);
      this.appCopied = app.id;
      clearTimeout(this.appCopyTimer);
      this.appCopyTimer = setTimeout(() => (this.appCopied = ""), 2000);
    },
    copyText(text) {
      if (!text) return;
      const done = () => {
        this.copied = true;
        clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => (this.copied = false), 2000);
      };
      const fallback = () => {
        const t = document.createElement("textarea");
        t.value = text;
        t.setAttribute("readonly", "");
        t.style.position = "fixed";
        t.style.opacity = "0";
        document.body.appendChild(t);
        t.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(t);
        if (ok) done();
        else this.notify("Couldn't copy. Select the text and copy it manually.");
      };
      if (navigator.clipboard && window.isSecureContext)
        navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    },
    /* create admin/staff account (super admin lng) */
    openCreateDialog(app) {
      if (!this.isSuper) return;
      const fromApp = app && app.id && app.status === "Approved" ? app : null;
      this.createDialog = {
        name: fromApp ? fromApp.name : "",
        username: "",
        password: "",
        ack: false,
        appId: fromApp ? fromApp.id : "",
        appEmail: fromApp ? fromApp.email : "",
      };
      this.createError = "";
    },
    /* password randomize */
    autoCreatePassword() {
      const d = this.createDialog;
      if (!d) return;
      const user = (d.username || "").trim();
      const ready = (d.name || "").trim().length > 0 && user.length >= 4 && !/\s/.test(user);
      if (ready && !d.password) d.password = this.generateTempPassword();
      else if (!ready) d.password = "";
    },
    closeCreateDialog() {
      this.createDialog = null;
      this.createError = "";
    },
    submitCreateAccount() {
      const d = this.createDialog;
      if (!d || !this.isSuper) return;
      const name = d.name.trim(),
        username = d.username.trim();
      if (!name) {
        this.createError = "Enter the staff member's full name.";
        return;
      }
      if (username.length < 4 || /\s/.test(username)) {
        this.createError =
          "Username must be at least 4 characters with no spaces.";
        return;
      }
      const lower = username.toLowerCase();
      if (
        lower === this.superAdmin.username.toLowerCase() ||
        this.staffAccounts.some((s) => s.username.toLowerCase() === lower) ||
        this.profiles.some((p) => this.sameEmail(p.email, username))
      ) {
        this.createError = "That username is already taken. Choose another.";
        return;
      }
      if (!d.password) {
        this.createError = "Fill in the full name and username to generate the password.";
        return;
      }
      if (!d.ack) {
        this.createError = "Please tick the box to confirm you understand.";
        return;
      }
      let appIndex = -1;
      if (d.appId) {
        appIndex = this.applications.findIndex((a) => a.id === d.appId);
        const a = appIndex >= 0 ? this.applications[appIndex] : null;
        if (!a || a.status !== "Approved" || this.appStaff(a)) {
          this.createError = "This application is no longer waiting for an account.";
          return;
        }
      }
      const staffId = this.id("STF", this.staffAccounts);
      this.staffAccounts.push({
        id: staffId,
        name,
        username,
        password: d.password,
        passwordChanged: false,
      });
      if (appIndex >= 0) {
        const a = this.applications[appIndex];
        this.applications.splice(appIndex, 1, { ...a, staffUsername: username, staffId });
        this.pushNotification(
          a.accountEmail,
          "Staff account created",
          `Your staff account is ready. Your staff username is ${username}. Check your registered email to receive your temporary password.`,
          "application",
          "",
        );
        this.modTab = "applications";
      } else {
        this.modTab = "staff";
      }
      this.modSearch = "";
      this.persist();
      this.closeCreateDialog();
      this.notify(`Staff account "${username}" created`);
    },
    /* My account: admin/ staff profile and change password */
    loadAdminProfile() {
      const src = this.isSuper ? this.superAdmin : this.currentStaff || {};
      this.adminProfile = {
        name: src.name || "",
        address: src.address || "",
        contact: src.contact || "",
      };
    },
    saveAdminProfile() {
      const f = this.adminProfile;
      const name = (f.name || "").trim();
      if (!name) {
        this.notify("Enter your full name.");
        return;
      }
      const patch = { name, address: (f.address || "").trim(), contact: (f.contact || "").trim() };
      if (this.isSuper) {
        this.superAdmin = { ...this.superAdmin, ...patch };
      } else {
        const i = this.staffAccounts.findIndex((s) => s.id === (this.session || {}).staffId);
        if (i < 0) {
          this.notify("Account not found. Please log in again.");
          return;
        }
        this.staffAccounts.splice(i, 1, { ...this.staffAccounts[i], ...patch });
      }
      this.persist();
      this.notify("Profile saved");
    },
    pwReset() {
      this.pwForm = { current: "", next: "", confirm: "", show: false };
      this.pwError = "";
    },
    /* resident, staff and super admin: the previous password is required */
    changePassword() {
      const f = this.pwForm;
      if (!this.session) return;
      let stored = "";
      if (this.role === "resident") {
        const p = this.profiles.find((x) => this.sameEmail(x.email, this.resident.email));
        if (!p) {
          this.pwError = "Account not found. Please log in again.";
          return;
        }
        stored = p.password || "";
      } else if (this.isSuper) {
        stored = this.superAdmin.password;
      } else {
        if (!this.currentStaff) {
          this.pwError = "Account not found. Please log in again.";
          return;
        }
        stored = this.currentStaff.password;
      }
      if (!f.current) {
        this.pwError = "Enter your previous password.";
        return;
      }
      if (f.current !== stored) {
        this.pwError = "Your previous password is incorrect.";
        return;
      }
      if (f.next.length < MIN_PASSWORD) {
        this.pwError = `Use a new password with at least ${MIN_PASSWORD} characters.`;
        return;
      }
      if (f.next === f.current) {
        this.pwError = "Your new password must be different from your previous password.";
        return;
      }
      if (f.next !== f.confirm) {
        this.pwError = "The two new passwords do not match.";
        return;
      }
      if (this.role === "resident") {
        this.updateProfile(this.resident.email, { password: f.next });
      } else if (this.isSuper) {
        this.superAdmin = { ...this.superAdmin, password: f.next };
      } else {
        const i = this.staffAccounts.findIndex((s) => s.id === this.session.staffId);
        this.staffAccounts.splice(i, 1, {
          ...this.staffAccounts[i],
          password: f.next,
          passwordChanged: true,
        });
      }
      this.persist();
      this.pwReset();
      this.notify("Password changed");
    },
    /* required change password for admin/staff */
    submitForcedPassword() {
      const f = this.forcePw;
      const staff = this.currentStaff;
      if (!this.mustChangePassword || !staff) return;
      if (f.next.length < MIN_PASSWORD) {
        this.forcePwError = `Use a new password with at least ${MIN_PASSWORD} characters.`;
        return;
      }
      if (f.next === staff.password) {
        this.forcePwError = "Your new password must be different from the temporary password.";
        return;
      }
      if (f.next !== f.confirm) {
        this.forcePwError = "The two passwords do not match.";
        return;
      }
      const i = this.staffAccounts.findIndex((s) => s.id === staff.id);
      if (i < 0) return;
      this.staffAccounts.splice(i, 1, {
        ...this.staffAccounts[i],
        password: f.next,
        passwordChanged: true,
      });
      this.forcePw = { next: "", confirm: "", show: false };
      this.forcePwError = "";
      this.persist();
      this.notify("Password changed. You're all set.");
    },
    logout() {
      this.forcePw = { next: "", confirm: "", show: false };
      this.forcePwError = "";
      this.authView = "resident";
      this.authMode = "login";
      this.session = null;
      this.notifOpen = false;
      this.pwReset();
      this.resident = this.blankResident();
      this.reportForm.name = "";
      this.documentForm.contact = "";
      this.trackId = "";
      this.trackSearched = false;
      this.page = "home";
      this.adminPage = "overview";
      this.authError = "";
      this.persist();
      window.scrollTo({ top: 0 });
    },
    goService() {
      document
        .getElementById("services")
        ?.scrollIntoView({ behavior: "smooth" });
      if (this.page !== "home") this.page = "services";
    },
    openDocument() {
      this.page = "documents";
      this.documentForm.contact = this.resident.contact || "";
    },
    submitDocument() {
      if (this.resident.deactivated) return;
      if (!this.resident.verified) {
        this.page = "account";
        this.notify("Please complete resident verification first.");
        return;
      }
      if (this.docLimitReached) {
        this.notify(
          `You already have ${this.maxActiveRequests} active document requests. Wait until one is completed or rejected.`,
        );
        return;
      }
      const limit = this.docLimitFor(this.documentForm.barangay);
      const types = this.documentForm.types.slice();
      if (!types.length) {
        this.notify("Please select at least one document.");
        return;
      }
      if (types.length > limit) {
        this.notify(`${this.documentForm.barangay} allows up 1 to ${limit} documents per request.`);
        return;
      }
      const r = {
        id: this.id("DOC", this.requests),
        name: this.resident.name,
        email: this.resident.email,
        types,
        type: types.join(", "),
        purpose: this.documentForm.purpose,
        date: this.documentForm.date,
        time: this.documentForm.time,
        contact: this.documentForm.contact,
        province: this.documentForm.province,
        municipality: this.documentForm.municipality,
        barangay: this.documentForm.barangay,
        status: "Pending",
        created: todayString(),
      };
      this.requests.unshift(r);
      this.persist();
      this.modalTitle = "Request submitted";
      this.modalMessage =
        "Your document request has been recorded. Keep the reference number and use Track Status to follow its progress.";
      this.modalRef = r.id;
      this.modalNext = "track";
      this.trackId = r.id;
      this.modal = "success";
      this.documentForm = {
        types: [],
        purpose: "",
        date: "",
        time: "",
        contact: this.resident.contact || "",
        province: "Cavite",
        municipality: "Carmona",
        barangay: "",
      };
    },
    submitReport() {
      if (this.resident.deactivated) return;
      if (this.reportLimitReached) {
        this.notify(
          `You already have ${this.maxActiveRequests} active concern reports. Wait until one is resolved or rejected.`,
        );
        return;
      }
      const r = {
        id: this.id("REP", this.reports),
        category: this.reportForm.category,
        location: this.reportForm.location,
        description: this.reportForm.description,
        name: this.reportForm.name,
        email: this.resident.email || "",
        contact: this.reportForm.contact,
        province: this.reportForm.province,
        municipality: this.reportForm.municipality,
        barangay: this.reportForm.barangay,
        status: "Submitted",
        created: todayString(),
        updated: todayString(),
        owner: "resident",
      };
      this.reports.unshift(r);
      this.persist();
      this.modalTitle = "Report submitted";
      this.modalMessage =
        "Thank you for reporting this concern. Use the reference number to check the status as barangay staff reviews it.";
      this.modalRef = r.id;
      this.modalNext = "track";
      this.trackId = r.id;
      this.modal = "success";
      this.reportForm = {
        category: "",
        location: "",
        description: "",
        name: this.resident.name || "",
        contact: "",
        province: "Cavite",
        municipality: "Carmona",
        barangay: "",
      };
    },
    trackSearch() {
      this.trackSearched = true;
    },
    /* exit the tracking details */
    closeTrack() {
      this.trackSearched = false;
      this.trackId = "";
    },
    countByStatus(list, s) {
      return s === "All" ? list.length : list.filter((r) => r.status === s).length;
    },
    /* resident own profile picture */
    pickPhoto(event) {
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      if (input) input.value = "";
      if (!file || this.role !== "resident") return;
      this.photoError = "";
      if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
        this.photoError = "Please choose a PNG, JPG, WEBP or GIF image.";
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        this.photoError = "That image is too large. Choose one under 8 MB.";
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        this.photoError = "Couldn't read that file. Try another image.";
      };
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => {
          this.photoError = "That file isn't a valid image.";
        };
        img.onload = () => {
          /* pfp size pic */
          const size = 256;
          const side = Math.min(img.width, img.height);
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(
            img,
            (img.width - side) / 2,
            (img.height - side) / 2,
            side,
            side,
            0,
            0,
            size,
            size,
          );
          const photo = canvas.toDataURL("image/jpeg", 0.85);
          if (!this.updateProfile(this.resident.email, { photo })) {
            this.photoError = "Account not found. Please log in again.";
            return;
          }
          try {
            this.persist();
          } catch (e) {
            this.updateProfile(this.resident.email, { photo: "" });
            this.photoError = "Not enough storage space to save the picture.";
            return;
          }
          this.notify("Profile picture updated");
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    },
    removePhoto() {
      if (this.role !== "resident" || !this.resident.photo) return;
      this.photoError = "";
      this.updateProfile(this.resident.email, { photo: "" });
      this.persist();
      this.notify("Profile picture removed");
    },
    /* save profile resident */
    saveProfile() {
      const i = this.profiles.findIndex((p) =>
        this.sameEmail(p.email, this.resident.email),
      );
      if (i < 0) {
        this.notify("Account not found. Please log in again.");
        return;
      }
      this.profiles.splice(i, 1, {
        ...this.profiles[i],
        name: this.resident.name,
        address: this.resident.address,
        contact: this.resident.contact,
      });
      this.persist();
      this.notify("Resident profile saved");
    },
    /* verfied toggle kay admin lng to */
    toggleVerified(p) {
      p.verified = !p.verified;
      let i = this.profiles.findIndex((x) => this.sameEmail(x.email, p.email));
      if (i >= 0) this.profiles.splice(i, 1, { ...p });
      if (this.sameEmail(p.email, this.resident.email))
        this.resident.verified = p.verified;
      this.pushNotification(
        p.email,
        p.verified ? "Account verified" : "Verification revoked",
        p.verified
          ? "Your resident account has been verified. You can now request documents."
          : "Your resident verification was revoked. Please visit the barangay hall.",
        "account",
        "",
      );
      this.persist();
      this.notify(
        p.verified ? "Resident marked verified" : "Verification revoked",
      );
    },
    /* Rejected needs dahilan*/
    onDocStatusChange(r, ev) {
      const status = ev.target.value;
      if (r.archived) {
        ev.target.value = r.status;
        this.notify("Restore this request first to change its status");
        return;
      }
      if (status === "Rejected") {
        ev.target.value = r.status;
        this.openReject("doc", r);
        return;
      }
      this.updateRequest(r, status);
    },
    onReportStatusChange(r, ev) {
      const status = ev.target.value;
      if (r.archived) {
        ev.target.value = r.status;
        this.notify("Restore this report first to change its status");
        return;
      }
      if (status === "Rejected") {
        ev.target.value = r.status;
        this.openReject("report", r);
        return;
      }
      this.updateReport(r, status);
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
    confirmReject() {
      const d = this.rejectDialog;
      if (!d) return;
      const reason = d.reason.trim();
      if (reason.length < 5) {
        this.rejectError = "Please enter a reason for the rejection (at least 5 characters).";
        return;
      }
      if (d.kind === "doc") this.updateRequest(d.item, "Rejected", reason);
      else this.updateReport(d.item, "Rejected", reason);
      this.closeReject();
    },
    /* update requestt */
    updateRequest(r, status, reason = "") {
      if (r.status === status) return;
      r.status = status;
      r.updated = todayString();
      r.rejectionReason = status === "Rejected" ? reason : "";
      r.rejectedOn = status === "Rejected" ? todayString() : "";
      const autoArchive = status === "Completed" || status === "Rejected";
      this.applyAutoArchive(r, autoArchive, "docSelected");
      const msg = {
        Pending: "is back to pending review.",
        Approved: "has been approved.",
        "Ready for Pickup": "is ready. Please visit the barangay hall to pick it up.",
        Completed: "has been completed.",
        Rejected: `was rejected. Reason: ${reason}`,
      }[status];
      this.pushNotification(
        r.email,
        `Document request: ${status}`,
        `${r.type} (${r.id}) ${msg}`,
        "document",
        r.id,
      );
      this.persist();
      this.notify(
        autoArchive
          ? `Document request ${status.toLowerCase()} and moved to Archive`
          : "Document request updated",
      );
    },
    /* update reportt */
    updateReport(r, status, reason = "") {
      if (r.status === status) return;
      r.status = status;
      r.updated = todayString();
      r.rejectionReason = status === "Rejected" ? reason : "";
      r.rejectedOn = status === "Rejected" ? todayString() : "";
      const autoArchive = status === "Resolved" || status === "Rejected";
      this.applyAutoArchive(r, autoArchive, "reportSelected");
      this.pushNotification(
        r.email,
        `Concern report: ${status}`,
        status === "Rejected"
          ? `Your report "${r.category}" (${r.id}) was rejected. Reason: ${reason}`
          : `Your report "${r.category}" (${r.id}) is now ${status}.`,
        "report",
        r.id,
      );
      this.persist();
      this.notify(
        autoArchive
          ? `Concern report ${status.toLowerCase()} and moved to Archive`
          : "Concern report status updated",
      );
    },
    /* final status then automatic nayan sa archive */
    applyAutoArchive(item, shouldArchive, selKey) {
      if (shouldArchive) {
        item.archived = true;
        item.archivedOn = todayString();
        item.autoArchived = true;
        this[selKey] = this[selKey].filter((x) => x !== item.id);
      } else if (item.archived && item.autoArchived) {
        item.archived = false;
        item.archivedOn = "";
        item.autoArchived = false;
      }
    },
    /* archive / restore kay admin lang to*/
    toggleArchive(item, label) {
      item.archived = !item.archived;
      item.archivedOn = item.archived ? todayString() : "";
      item.autoArchived = false;
      this.persist();
      this.notify(
        item.archived ? `${label} archived` : `${label} restored from archive`,
      );
    },
    /* select all or select all then archive */
    visibleFor(kind) {
      return kind === "doc" ? this.filteredRequests : this.filteredReports;
    },
    selectedFor(kind) {
      return kind === "doc" ? this.docSelected : this.reportSelected;
    },
    allSelected(kind) {
      const rows = this.visibleFor(kind);
      const sel = this.selectedFor(kind);
      return rows.length > 0 && rows.every((r) => sel.includes(r.id));
    },
    toggleAll(kind) {
      const ids = this.allSelected(kind)
        ? []
        : this.visibleFor(kind).map((r) => r.id);
      if (kind === "doc") this.docSelected = ids;
      else this.reportSelected = ids;
    },
    clearSelection(kind) {
      if (kind === "doc") this.docSelected = [];
      else this.reportSelected = [];
    },
    bulkArchive(kind) {
      const ids = this.selectedFor(kind);
      if (!ids.length) return;
      const archiving =
        (kind === "doc" ? this.docView : this.reportView) === "active";
      const list = kind === "doc" ? this.requests : this.reports;
      let n = 0;
      list.forEach((r) => {
        if (ids.includes(r.id)) {
          r.archived = archiving;
          r.archivedOn = archiving ? todayString() : "";
          n++;
        }
      });
      this.clearSelection(kind);
      this.persist();
      const noun = kind === "doc" ? "document request" : "concern report";
      this.notify(`${n} ${noun}${n === 1 ? "" : "s"} ${archiving ? "archived" : "restored"}`);
    },
    /* walang pasok announcement */
    publishAnnouncement() {
      const a = { id: this.id("ANN", this.announcements), ...this.postForm };
      this.announcements.unshift(a);
      this.persist();
      this.postForm = {
        title: "",
        type: "Announcement",
        body: "",
        date: todayString(),
      };
      this.showPostForm = false;
      this.notify("Announcement published");
    },
    /* delete uliut*/
    deleteAnnouncement(id) {
      this.announcements = this.announcements.filter((a) => a.id !== id);
      this.deletingId = "";
      this.persist();
      this.notify("Announcement deleted");
    },
    saveSettings() {
      this.persist();
      this.notify("Barangay settings saved");
    },
    resetData() {
      if (
        !confirm("Reset all data? This cannot be undone.")
      )
        return;
      localStorage.removeItem(STORAGE_KEY);
      Object.assign(this, defaultData());
      this.resident = this.blankResident();
      this.authView = "resident";
      this.authMode = "login";
      this.page = "home";
      this.adminPage = "overview";
      this.notify("data reset");
    },
    pushNotification(email, title, body, kind, ref) {
      if (!email) return;
      this.notifications.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        created: Date.now(),
        email,
        title,
        body,
        kind,
        ref,
        read: false,
      });
    },
    /* dismiss emergency alert pag na toggle*/
    dismissEmergency() {
      const email = (this.resident.email || "").toLowerCase();
      if (!email || !this.activeAlert) return;
      this.dismissedEmergencies = {
        ...(this.dismissedEmergencies || {}),
        [email]: this.activeAlert.id,
      };
      this.persist();
    },
    dismissNotifications() {
      this.notifications = this.notifications.filter(
        (n) => !this.sameEmail(n.email, this.resident.email),
      );
      this.persist();
    },
    toggleNotifications() {
      this.notifOpen = !this.notifOpen;
    },
    markAllRead() {
      this.residentNotifications.forEach((n) => (n.read = true));
      this.persist();
    },
    openNotification(n) {
      n.read = true;
      this.persist();
      this.notifOpen = false;
      if (n.ref) {
        this.trackId = n.ref;
        this.page = "track";
        this.trackSearch();
      } else if (n.kind === "account") this.page = "account";
      else if (n.kind === "application") {
        /* staff application approved / rejected  */
        this.goToApplyBlock();
        return;
      }
      window.scrollTo({ top: 0 });
    },
    goToApplyBlock() {
      this.page = "home";
      this.$nextTick(() => {
        setTimeout(() => {
          const el = document.getElementById("apply-block");
          if (!el) return window.scrollTo({ top: 0 });
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.remove("apply-flash");
          void el.offsetWidth; 
          el.classList.add("apply-flash");
          setTimeout(() => el.classList.remove("apply-flash"), 2600);
        }, 60);
      });
    },
    dismissNotifications() {
      this.notifications = this.notifications.filter(
        (n) => !this.sameEmail(n.email, this.resident.email),
      );
      this.persist();
      this.notifOpen = false;
    },
    /* Online presence green and grey */
    presenceKeyFor(s) {
      if (!s) return "";
      if (s.role === "resident")
        return s.email ? "r:" + s.email.toLowerCase() : "";
      if (s.role === "admin") return s.super ? "super" : s.staffId ? "s:" + s.staffId : "";
      return "";
    },
    presenceRead() {
      try {
        return JSON.parse(localStorage.getItem("kabrgy_presence") || "{}") || {};
      } catch (e) {
        return {};
      }
    },
    presenceWrite(map) {
      try {
        localStorage.setItem("kabrgy_presence", JSON.stringify(map));
      } catch (e) {}
    },
    presenceClear(key) {
      if (!key) return;
      const map = this.presenceRead();
      delete map[key];
      this.presenceWrite(map);
      this.presence = map;
    },
    presenceBeat() {
      const now = Date.now();
      const map = this.presenceRead();
      const key = this.presenceKeyFor(this.session);
      if (key) map[key] = now;
      for (const k in map) if (now - map[k] > 180000) delete map[k]; 
      if (key) this.presenceWrite(map);
      this.presence = map;
      this.presenceNow = now;
    },
    isOnlineKey(key) {
      const t = key && this.presence ? this.presence[key] : 0;
      return !!t && this.presenceNow - t < 75000;
    },
    residentOnline(email) {
      return email ? this.isOnlineKey("r:" + email.toLowerCase()) : false;
    },
    staffOnline(s) {
      return !!s && this.isOnlineKey("s:" + s.id);
    },
    /* label table column (di pa ayos wag galawin) */
    labelTables() {
      document.querySelectorAll("table").forEach((t) => {
        const heads = Array.from(t.querySelectorAll("thead th")).map((h) =>
          h.textContent.trim(),
        );
        t.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            if (td.hasAttribute("colspan")) return;
            const label = heads[i] || (td.classList.contains("check-cell") ? "Select" : "");
            if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
          });
        });
      });
    },
    timeAgo(ts) {
      if (!ts || typeof ts !== "number") return "";
      const m = Math.floor((Date.now() - ts) / 60000);
      if (m < 1) return "Just now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return this.formatDate(new Date(ts).toISOString().slice(0, 10));
    },
    notify(msg) {
      this.toast = msg;
      setTimeout(() => {
        this.toast = "";
      }, 2800);
    },
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
    document.addEventListener("click", (e) => {
      if (this.notifOpen && !e.target.closest(".notif-wrap"))
        this.notifOpen = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      this.notifOpen = false;
      if (this.warnDialog) this.closeWarnDialog();
      else if (this.residentView) this.closeResidentView();
      else if (this.modDialog) this.closeModDialog();
      else if (this.accountDialog) this.closeAccountDialog();
      else if (this.rejectDialog) this.closeReject();
      else if (this.role === "resident" && this.page === "track" && this.trackSearched) this.closeTrack();
    });
    /* live updates */
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY || e.key === null) this.syncFromStorage();
    });
    this.syncTimer = setInterval(() => this.syncFromStorage(), 3000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.syncFromStorage();
    });
    window.addEventListener("focus", () => this.syncFromStorage());
    this.labelTables();
    /* online status */
    this.presenceBeat();
    this.presenceTimer = setInterval(() => this.presenceBeat(), 10000);
    window.addEventListener("storage", (e) => {
      if (e.key === "kabrgy_presence") {
        this.presence = this.presenceRead();
        this.presenceNow = Date.now();
      }
    });
    window.addEventListener("pagehide", () =>
      this.presenceClear(this.presenceKeyFor(this.session)),
    );
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.presenceBeat();
    });
    this.reportForm.name = this.resident.name || "";
    this.documentForm.contact = this.resident.contact || "";
    this.warningAck =
      this.role === "resident" &&
      !this.resident.deactivated &&
      this.resident.warnings.some((w) => !w.seen);
    this.persist();
  },
  updated() {
    this.labelTables();
  },
}).mount("#app");