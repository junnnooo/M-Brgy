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

      // data from the API
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
      trackId: "",
      trackSearched: false,
      trackedReport: null,
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
    // Announcements and emergency alerts are separate tables; the UI treats them as one board.
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
    // For residents the API only returns their own records.
    residentRequests() {
      return this.requests;
    },
    residentReports() {
      return this.reports;
    },
    residentNotifications() {
      return this.notifications;
    },
    filteredAnnouncements() {
      return this.announcements.filter(
        (a) => this.announcementFilter === "All" || a.type === this.announcementFilter,
      );
    },
    pendingResidents() {
      return this.profiles.filter((p) => !p.verified);
    },
    pendingRequests() {
      return this.requests.filter((r) => r.status === "Pending");
    },
    openReports() {
      return this.reports.filter((r) => r.status !== "Resolved");
    },
    filteredRequests() {
      return this.requests.filter(
        (r) => this.requestFilter === "All" || r.status === this.requestFilter,
      );
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
      this.trackedReport = null;
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
          "Your document request has been sent to the barangay. Keep the reference number to follow up.";
        this.modalRef = r.ref;
        this.modalNext = "documents";
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
    async trackSearch() {
      this.trackSearched = true;
      this.trackedReport = null;
      const n = parseInt(String(this.trackId).replace(/\D/g, ""), 10);
      if (!n) return;
      try {
        this.trackedReport = await api.get(`/reports/${n}`);
      } catch (e) {
        if (e.status !== 404) this.notify(e.message);
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
    async dismissNotifications() {
      try {
        await api.post("/notifications/dismiss");
        this.notifications = [];
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
    this.boot();
  },
}).mount("#app");
