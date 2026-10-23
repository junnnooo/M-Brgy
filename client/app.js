const { createApp } = Vue;

const todayString = () => new Date().toISOString().slice(0, 10);

const TIME_SLOTS = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "15:00", label: "3:00 PM" },
];

const blankResident = () => ({
  first_name: "", middle_name: "", last_name: "",
  email: "", address: "", contact_number: "", verified: false,
});
const defaultSettings = () => ({ name: "kaBRGY", address: "", hours: "" });
const blankSignup = () => ({ first_name: "", last_name: "", email: "", brgy_id: "", password: "", confirm: "" });
const blankPost = () => ({ title: "", type: "Announcement", body: "", date: todayString() });
const blankDocumentForm = () => ({
  province_id: "", municipality_id: "", brgy_id: "",
  service_type_id: "", purpose: "", date: "", time: "",
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

      authView: "resident",
      authMode: "login",
      authError: "",
      loginForm: { email: "", password: "" },
      signupForm: blankSignup(),
      adminForm: { email: "", password: "" },
      page: "home",
      adminPage: "overview",
      announcementFilter: "All",
      requestFilter: "All",
      documentForm: blankDocumentForm(),
      reportForm: blankReportForm(),
      postForm: blankPost(),

      // admin tables: search by email + Active / Archived views
      verifSearch: "",
      docSearch: "",
      reportSearch: "",
      docView: "active",
      reportView: "active",

      // Track Status: one lookup for either a document request (DOC-) or a concern report (REP-)
      trackId: "",
      trackSearched: false,
      trackLoading: false,
      trackSeq: 0,
      trackedItem: null,

      notifOpen: false,
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
      return this.profiles.filter((p) => !p.verified);
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
      return this.profiles.filter((p) => this.matches(this.verifSearch, [p.email, p.name, p.address]));
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
      return list.filter((r) => this.matches(this.reportSearch, [r.email, r.name, r.ref]));
    },
    documentStatuses() {
      return ["Pending", "Approved", "Ready for Pickup", "Completed"];
    },
    reportStatuses() {
      return ["Submitted", "Received", "In Progress", "Resolved"];
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
      };
      if (me.barangay) {
        this.settings = {
          name: me.barangay.brgy_name,
          address: me.barangay.address || "",
          hours: me.barangay.office_hours || "",
        };
      }
    },
    async loadAll() {
      const q = this.me.brgy_id ? `?brgy_id=${this.me.brgy_id}` : "";
      const staff = this.role === "admin";
      const [posts, alerts, notifications, requests, reports, profiles] = await Promise.all([
        api.get(`/announcements${q}`),
        api.get(`/alerts${q}`),
        api.get("/notifications"),
        api.get(staff ? "/requests" : "/requests/mine"),
        api.get(staff ? "/reports" : "/reports/mine"),
        staff ? api.get("/accounts") : Promise.resolve([]),
      ]);
      Object.assign(this, { posts, alerts, notifications, requests, reports, profiles });
    },
    async refreshPublic() {
      const q = this.me?.brgy_id ? `?brgy_id=${this.me.brgy_id}` : "";
      [this.posts, this.alerts] = await Promise.all([
        api.get(`/announcements${q}`),
        api.get(`/alerts${q}`),
      ]);
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
    // Case-insensitive "contains" across the given fields; an empty query matches everything.
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
      if (h == 1) return "1h ago";
      if (h < 24) return `${h}h ago`;
      return this.formatDate(new Date(t).toISOString().slice(0, 10));
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

    /* ---------- auth ---------- */
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
      });
      this.documentForm = blankDocumentForm();
      this.reportForm = blankReportForm();
      this.trackId = "";
      this.trackSearched = false;
      this.trackLoading = false;
      this.trackedItem = null;
      this.trackSeq++;
      this.notifOpen = false;
      this.verifSearch = this.docSearch = this.reportSearch = "";
      this.docView = this.reportView = "active";
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
      if (clearance) this.documentForm.service_type_id = clearance.service_type_id;
      this.documentForm.purpose = "Appointment / document processing";
    },
    async submitDocument() {
      if (!this.resident.verified) {
        this.page = "account";
        this.notify("Please complete resident verification first.");
        return;
      }
      const f = this.documentForm;
      try {
        const r = await api.post("/requests", {
          service_type_id: f.service_type_id,
          brgy_id: f.brgy_id,
          purpose: f.purpose,
          appointment_date: f.date,
          appointment_time: f.time,
        });
        this.requests.unshift(r);
        this.modalTitle = "Request submitted";
        this.modalMessage =
          "Your document request has been sent to the barangay. Keep the reference number and use Track Status to follow its progress.";
        this.modalRef = r.ref;
        this.modalNext = "track";
        this.trackId = r.ref;
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

    // Track Status: DOC-<n> looks up a document request, REP-<n> a concern report.
    //               A bare number could be either, so it tries the report first and then the request.
    async trackSearch() {
      const seq = ++this.trackSeq;
      this.trackSearched = true;
      this.trackedItem = null;
      const raw = String(this.trackId).trim().toUpperCase();
      const n = parseInt(raw.replace(/\D/g, ""), 10);
      if (!n) return;

      const kinds = raw.startsWith("DOC") ? ["document"] : raw.startsWith("REP") ? ["report"] : ["report", "document"];
      this.trackLoading = true;
      try {
        for (const kind of kinds) {
          try {
            const data = await api.get(kind === "report" ? `/reports/${n}` : `/requests/${n}`);
            if (seq === this.trackSeq) this.trackedItem = { kind, data };
            return;
          } catch (e) {
            if (e.status !== 404) {
              if (seq === this.trackSeq) this.notify(e.message);
              return;
            }
          }
        }
      } finally {
        if (seq === this.trackSeq) this.trackLoading = false;
      }
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
      if (this.notifOpen) this.loadNotifications();
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
    async updateRequest(r, status, evt) {
      try {
        Object.assign(r, await api.patch(`/requests/${r.id}/status`, { status }));
        this.notify("Document request updated");
      } catch (e) {
        if (evt) evt.target.value = r.status;
        this.notify(e.message);
      }
    },
    async updateReport(r, status, evt) {
      try {
        Object.assign(r, await api.patch(`/reports/${r.id}/status`, { status }));
        this.notify("Concern report status updated");
      } catch (e) {
        if (evt) evt.target.value = r.status;
        this.notify(e.message);
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
      if (!confirm("Delete this announcement from the board?")) return;
      try {
        if (a.kind === "alert") {
          await api.del(`/alerts/${a.id}`);
          this.alerts = this.alerts.filter((x) => x.id !== a.id);
        } else {
          await api.del(`/announcements/${a.id}`);
          this.posts = this.posts.filter((x) => x.id !== a.id);
        }
        this.notify("Announcement deleted");
      } catch (e) {
        this.notify(e.message);
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
    document.addEventListener("click", (e) => {
      if (this.notifOpen && !e.target.closest(".notif-wrap")) this.notifOpen = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.notifOpen = false;
    });
    setInterval(() => this.loadNotifications(), 60000);
    this.boot();
  },
}).mount("#app");
