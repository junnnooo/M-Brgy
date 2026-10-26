// Landing page: one scrolling page. The top tabs light up as each section scrolls into view,
// and the province → municipality → barangay picker fills from the API.
const API_URL = location.port === "5173" ? "http://localhost:3000/api" : "/api";
const COLLAPSED_COUNT = 5;

const $ = (id) => document.getElementById(id);
const provinceEl = $("province");
const municipalityEl = $("municipality");
const statusEl = $("finder-status");
const resultsEl = $("finder-results");
const emptyEl = $("finder-empty");
const listEl = $("brgy-list");
const toggleEl = $("brgy-toggle");

let locations = [];
let expanded = false;
let loadFailed = false;

/* ---------- Tabs follow the scroll ---------- */
const header = document.querySelector(".topbar");
const tabs = [...document.querySelectorAll("[data-nav]")];
const sections = tabs.map((a) => document.getElementById(a.dataset.nav)).filter(Boolean);

function updateActiveTab() {
  // A section becomes current once its top reaches this line, just under the header,
  // so the tab switches when the blue hero has scrolled out of view
  const line = header.offsetHeight + 80;
  let current = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    current = sections[sections.length - 1];
  }
  tabs.forEach((a) => {
    const on = current && a.dataset.nav === current.id;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}

/* ---------- Picker ---------- */
function fillOptions(select, placeholder, items, valueKey, labelKey) {
  select.replaceChildren(new Option(placeholder, ""));
  items.forEach((item) => select.add(new Option(item[labelKey], item[valueKey])));
  select.disabled = items.length === 0;
}

function selectedProvince() {
  return locations.find((p) => String(p.province_id) === provinceEl.value);
}

function selectedMunicipality() {
  const p = selectedProvince();
  return p && p.municipalities.find((m) => String(m.municipality_id) === municipalityEl.value);
}

function renderList() {
  const m = selectedMunicipality();
  listEl.replaceChildren();
  toggleEl.hidden = true;
  resultsEl.hidden = true;
  // Big empty space with a hint until a municipality is picked
  emptyEl.hidden = !!m || loadFailed;
  if (!m) return;

  const all = m.barangays || [];
  if (!all.length) {
    statusEl.textContent = "No barangays are listed for this municipality yet.";
    return;
  }
  statusEl.textContent = "";
  resultsEl.hidden = false;

  (expanded ? all : all.slice(0, COLLAPSED_COUNT)).forEach((b) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "brgy-btn";
    btn.dataset.brgyId = b.brgy_id;
    btn.textContent = b.brgy_name;
    li.appendChild(btn);
    listEl.appendChild(li);
  });

  if (all.length > COLLAPSED_COUNT) {
    toggleEl.hidden = false;
    toggleEl.replaceChildren(
      document.createTextNode(expanded ? "See Less " : "See All "),
      Object.assign(document.createElement("span"), { textContent: expanded ? "⌃" : "⌄", ariaHidden: "true" })
    );
    toggleEl.setAttribute("aria-expanded", String(expanded));
  }
}

function onProvinceChange() {
  const p = selectedProvince();
  expanded = false;
  statusEl.textContent = "";
  fillOptions(municipalityEl, "Enter your municipality", p ? p.municipalities : [], "municipality_id", "municipality_name");
  renderList();
}

function onMunicipalityChange() {
  expanded = false;
  statusEl.textContent = "";
  renderList();
}

async function loadLocations() {
  try {
    const res = await fetch(`${API_URL}/locations`);
    if (!res.ok) throw new Error();
    locations = await res.json();
  } catch (e) {
    loadFailed = true;
    emptyEl.hidden = true;
    statusEl.textContent = "Can't load locations right now. Is the server running on port 3000?";
    return;
  }
  statusEl.textContent = "";
  fillOptions(provinceEl, "Enter your province", locations, "province_id", "province_name");
}

provinceEl.addEventListener("change", onProvinceChange);
municipalityEl.addEventListener("change", onMunicipalityChange);
toggleEl.addEventListener("click", () => {
  expanded = !expanded;
  renderList();
});

// Tab clicks scroll smoothly to the section without changing the address bar
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link || link.getAttribute("href").length < 2) return;
  e.preventDefault();
  const id = link.getAttribute("href").slice(1);
  const smooth = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  if (id === "home") {
    window.scrollTo({ top: 0, behavior: smooth });
    return;
  }
  const target = document.getElementById(id);
  if (target) target.scrollIntoView({ behavior: smooth, block: "start" });
});

window.addEventListener("scroll", updateActiveTab, { passive: true });
window.addEventListener("resize", updateActiveTab);
updateActiveTab();
loadLocations();