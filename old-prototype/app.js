const { createApp } = Vue;
const STORAGE_KEY = "kabrgy_dkoalam";
const todayString = () => new Date().toISOString().slice(0, 10);
const defaultData = () => ({
  session: null,
  admin: { username: "M-Admin", password: "M123" },
  profiles: [],
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
    name: "Your Barangay",
    address: "Barangay Hall",
    hours: "Monday–Friday, 8:00 AM–5:00 PM",
  },
  notifications: [],
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
    return {
      ...saved,
      session,
      resident,
      authView: "resident",
      authMode: "login",
      authError: "",
      loginForm: { email: "", password: "" },
      signupForm: { name: "", email: "", password: "", confirm: "" },
      adminForm: { username: "", password: "" },
      page: "home",
      adminPage: "overview",
      announcementFilter: "All",
      requestFilter: "All",
      documentForm: {
        type: "",
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
        municipality: "C",
        barangay: "",
      },
      verifSearch: "",
      docSearch: "",
      reportSearch: "",
      docView: "active",
      reportView: "active",
      postForm: {
        title: "",
        type: "Announcement",
        body: "",
        date: todayString(),
      },
      trackId: "",
      trackSearched: false,
      modal: "",
      modalTitle: "",
      modalMessage: "",
      modalRef: "",
      notifOpen: false,
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
      return this.session ? this.session.role : null;
    },
    latestAnnouncements() {
      return this.announcements
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3);
    },
    activeAlert() {
      return this.announcements.find((a) => a.type === "Emergency") || null;
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
    residentNotifications() {
      return this.notifications
        .filter((n) => this.sameEmail(n.email, this.resident.email))
        .slice()
        .sort((a, b) => (b.created || b.id) - (a.created || a.id));
    },
    unreadCount() {
      return this.residentNotifications.filter((n) => !n.read).length;
    },
    filteredAnnouncements() {
      return this.announcements
        .filter(
          (a) =>
            this.announcementFilter === "All" ||
            a.type === this.announcementFilter,
        )
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));
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
      return this.profiles.filter((p) =>
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
      return list.filter((r) =>
        this.matches(this.reportSearch, [r.email, r.name, r.id]),
      );
    },
    /* resident tracking: looks up the resident's own document requests and concern reports */
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
    adminLabel() {
      return {
        overview: "OVERVIEW",
        verifications: "RESIDENT RECORDS",
        documents: "SERVICE MANAGEMENT",
        reports: "COMMUNITY CONCERNS",
        posts: "PUBLIC INFORMATION",
        settings: "CONFIGURATION",
      }[this.adminPage];
    },
  },
  methods: {
    loadData() {
      try {
        return {
          ...defaultData(),
          ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
        };
      } catch (e) {
        return defaultData();
      }
    },
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          session: this.session,
          admin: this.admin,
          profiles: this.profiles,
          requests: this.requests,
          reports: this.reports,
          announcements: this.announcements,
          settings: this.settings,
          notifications: this.notifications,
        }),
      );
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
      return { name: "", email: "", address: "", contact: "", verified: false };
    },
    publicProfile(p) {
      return {
        name: p.name || "",
        email: p.email,
        address: p.address || "",
        contact: p.contact || "",
        verified: !!p.verified,
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
      this.persist();
      window.scrollTo({ top: 0 });
      this.notify(
        "Welcome, " + (this.resident.name || "resident").split(" ")[0],
      );
    },
    loginResident() {
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
    signUpResident() {
      const f = this.signupForm,
        email = f.email.trim();
      if (f.password.length < 6) {
        this.authError = "Use a password with at least 6 characters.";
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
    /* admin loginnnn */
    loginAdmin() {
      const f = this.adminForm;
      if (
        f.username.trim().toLowerCase() !== this.admin.username.toLowerCase() ||
        f.password !== this.admin.password
      ) {
        this.authError = "Incorrect username or password.";
        return;
      }
      this.session = { role: "admin" };
      this.adminPage = "overview";
      this.adminForm = { username: "", password: "" };
      this.authError = "";
      this.persist();
      window.scrollTo({ top: 0 });
      this.notify("Logged in as admin");
    },
    logout() {
      this.authView = this.role || "resident";
      this.authMode = "login";
      this.session = null;
      this.notifOpen = false;
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
      if (!this.resident.verified) {
        this.page = "account";
        this.notify("Please complete resident verification first.");
        return;
      }
      const r = {
        id: this.id("DOC", this.requests),
        name: this.resident.name,
        email: this.resident.email,
        type: this.documentForm.type,
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
        type: "",
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
    /* verfied toggle */
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
    /* update requestt */
    updateRequest(r, status) {
      if (r.status === status) return;
      r.status = status;
      r.updated = todayString();
      const msg = {
        Pending: "is back to pending review.",
        Approved: "has been approved.",
        "Ready for Pickup": "is ready. Please visit the barangay hall to pick it up.",
        Completed: "has been completed.",
        Rejected: "was rejected. Visit the barangay hall for details.",
      }[status];
      this.pushNotification(
        r.email,
        `Document request: ${status}`,
        `${r.type} (${r.id}) ${msg}`,
        "document",
        r.id,
      );
      this.persist();
      this.notify("Document request updated");
    },
    /* update reportt */
    updateReport(r, status) {
      if (r.status === status) return;
      r.status = status;
      r.updated = todayString();
      this.pushNotification(
        r.email,
        `Concern report: ${status}`,
        `Your report "${r.category}" (${r.id}) is now ${status}.`,
        "report",
        r.id,
      );
      this.persist();
      this.notify("Concern report status updated");
    },
    /* archive / restore */
    toggleArchive(item, label) {
      item.archived = !item.archived;
      item.archivedOn = item.archived ? todayString() : "";
      this.persist();
      this.notify(
        item.archived ? `${label} archived` : `${label} restored from archive`,
      );
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
    deleteAnnouncement(id) {
      if (!confirm("Delete this announcement from the board?")) return;
      this.announcements = this.announcements.filter((a) => a.id !== id);
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
      window.scrollTo({ top: 0 });
    },
    dismissNotifications() {
      this.notifications = this.notifications.filter(
        (n) => !this.sameEmail(n.email, this.resident.email),
      );
      this.persist();
      this.notifOpen = false;
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
      if (e.key === "Escape") this.notifOpen = false;
    });
    this.reportForm.name = this.resident.name || "";
    this.documentForm.contact = this.resident.contact || "";
    this.persist();
  },
}).mount("#app");
