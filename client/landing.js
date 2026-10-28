// Landing page: one site, no URL changes. Home (+ Barangay), Contact Us and About are shown and hidden
//               with `page`, the same idea as the portal's app.js. Vue comes from the CDN tag in index.html.
const { createApp, nextTick } = Vue;

const API_URL = location.port === "5173" ? "http://localhost:3000/api" : "/api";
const COLLAPSED_COUNT = 5;

function preloadHeroImages() {
  const urls = [...document.querySelectorAll(".hero .slice")]
    .map((el) => ((el.getAttribute("style") || "").match(/url\(\s*["']?([^"')]+)["']?\s*\)/) || [])[1])
    .filter(Boolean);
  return Promise.all(
    urls.map(
      (url) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = img.onerror = resolve;
          img.src = url;
        })
    )
  );
}

createApp({
  data() {
    return {
      page: "home",
      spy: "home",
      collapsedCount: COLLAPSED_COUNT,

      // Barangay picker
      locations: [],
      loadingLocations: true,
      loadFailed: false,
      provinceId: "",
      municipalityId: "",
      expanded: false,

      // Contact form
      form: { name: "", email: "", message: "" },
      errors: { name: "", email: "", message: "" },
      sending: false,
      result: null,
    };
  },

  computed: {
    // The Highlighted Tab: follows the scroll on Home, otherwise the page itself
    activeTab() {
      return this.page === "home" ? this.spy : this.page;
    },
    province() {
      return this.locations.find((p) => String(p.province_id) === String(this.provinceId));
    },
    municipalities() {
      return this.province ? this.province.municipalities : [];
    },
    municipality() {
      return this.municipalities.find((m) => String(m.municipality_id) === String(this.municipalityId));
    },
    barangays() {
      return this.municipality ? this.municipality.barangays || [] : [];
    },
    visibleBarangays() {
      return this.expanded ? this.barangays : this.barangays.slice(0, COLLAPSED_COUNT);
    },
    statusText() {
      if (this.loadFailed) return "Can't load locations right now. Is the server running on port 3000?";
      if (this.loadingLocations) return "Loading locations…";
      if (this.municipality && !this.barangays.length) return "No barangays are listed for this municipality yet.";
      return "";
    },
  },

  methods: {
    /* ---------- Navigation: show and hide ---------- */
    async go(target) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (target === "contact" || target === "about") {
        this.page = target;
        window.scrollTo({ top: 0 });
        return;
      }

      const comingBack = this.page !== "home";
      this.page = "home";
      await nextTick();
      const behavior = comingBack || reduced ? "auto" : "smooth";
      if (target === "home") window.scrollTo({ top: 0, behavior });
      else document.getElementById("barangay").scrollIntoView({ behavior, block: "start" });
      this.updateSpy();
    },

    updateSpy() {
      if (this.page !== "home") return;
      if (!this.$refs.header.offsetHeight) return;
      const barangay = document.getElementById("barangay");
      const line = this.$refs.header.offsetHeight + 80;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      this.spy = barangay && (barangay.getBoundingClientRect().top <= line || atBottom) ? "barangay" : "home";
    },

    /* ---------- Barangay picker ---------- */
    onProvinceChange() {
      this.municipalityId = "";
      this.expanded = false;
    },

    async loadLocations() {
      try {
        const res = await fetch(`${API_URL}/locations`);
        if (!res.ok) throw new Error();
        this.locations = await res.json();
      } catch (e) {
        this.loadFailed = true;
      }
      this.loadingLocations = false;
    },

    /* ---------- Contact form ---------- */
    validate() {
      const { name, email, message } = this.form;
      this.errors.name = name.trim() ? "" : "Please type your name.";
      if (!email.trim()) this.errors.email = "Please type your email address.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) this.errors.email = "This does not look like an email address. It should look like name@example.com.";
      else this.errors.email = "";
      this.errors.message = message.trim().length >= 10 ? "" : "Please write your message. A few words is enough.";
      return ["name", "email", "message"].find((field) => this.errors[field]);
    },

    async sendMessage() {
      this.result = null;
      const firstBad = this.validate();
      if (firstBad) {
        this.$refs[firstBad].focus();
        return;
      }

      this.sending = true;
      try {
        const res = await fetch(`${API_URL}/contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: this.form.name.trim(),
            email: this.form.email.trim(),
            message: this.form.message.trim(),
          }),
        });
        if (!res.ok) throw new Error();
        this.form = { name: "", email: "", message: "" };
        this.result = { kind: "success", text: "Thank you! Your message was sent. We will reply to your email soon." };
      } catch (e) {
        this.result = { kind: "error", text: "Sorry, we could not send your message right now. Please try again later, or call or email us using the details above." };
      }
      this.sending = false;
      await nextTick();
      if (this.$refs.result) this.$refs.result.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  },

  mounted() {
    document.querySelectorAll(".page-hero-logo").forEach((img) => {
      const useOriginal = () => {
        if (img.dataset.fallback) return;
        img.dataset.fallback = "1";
        img.src = "assets/logos/full_logo.png";
      };
      img.addEventListener("error", useOriginal);
      if (img.complete && img.naturalWidth === 0) useOriginal();
    });

    window.addEventListener("scroll", this.updateSpy, { passive: true });
    window.addEventListener("resize", this.updateSpy);
    window.addEventListener("load", this.updateSpy);
    requestAnimationFrame(this.updateSpy);

    // Everything starts loading right here, as before. The loading screen only waits for it, never slows it.
    const locations = this.loadLocations();
    if (window.kbLoader) {
      window.kbLoader.hold(locations);
      window.kbLoader.hold(preloadHeroImages());
    }
  },
}).mount("#app");