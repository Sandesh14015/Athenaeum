/* ==========================================================================
   THE GLOBAL PHILOSOPHY ARCHIVE - STATE MANAGER & CONTROLLER
   Handling: Map setup, JSON database load, Quote Loop, Router, 3D and Spoilers
   ========================================================================== */

// 1. APPLICATION STATE
const state = {
  philosophers: [],
  quotes: [],
  map: null,
  markers: {},
  activePhilosopherId: null,
  quoteIntervalId: null,
  activeQuoteIndex: 0
};

// 2. HELPER FUNCTIONS
// Darkens a hex color for spine/backcover shadows
function darkenColor(hex, percent) {
  let num = parseInt(hex.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) - amt,
      G = (num >> 8 & 0x00FF) - amt,
      B = (num & 0x0000FF) - amt;
  
  R = R < 0 ? 0 : R > 255 ? 255 : R;
  G = G < 0 ? 0 : G > 255 ? 255 : G;
  B = B < 0 ? 0 : B > 255 ? 255 : B;
  
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// Escapes HTML content safely
function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// 3. INITIALIZATION
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    state.philosophers = data.philosophers || [];
    state.quotes = data.flashing_quotes || [];
    
    // Init Quote Rotator
    initQuoteRotator();
    
    // Init Leaflet Map
    initMap();
    
    // Init Search Controls
    initSearch();

    // Init interactive CSS sculpture
    initPhilosopherModel();
    
    // Init Router (Hash Change listener)
    window.addEventListener("hashchange", handleRouting);
    handleRouting(); // run on initial load
    
  } catch (error) {
    console.error("Failed to load archive database:", error);
    document.getElementById("quote-text").innerText = "Failed to load the archives of wisdom. Please refresh.";
  }
});

// 4. QUOTE ROTATOR
function initQuoteRotator() {
  if (state.quotes.length === 0) return;
  
  const quoteTextElem = document.getElementById("quote-text");
  const quoteAuthorElem = document.getElementById("quote-author");
  
  // Set initial quote
  setQuote(state.quotes[0]);
  
  state.quoteIntervalId = setInterval(() => {
    // Fade out
    quoteTextElem.classList.add("quote-fade-out");
    quoteAuthorElem.classList.add("quote-fade-out");
    
    setTimeout(() => {
      state.activeQuoteIndex = (state.activeQuoteIndex + 1) % state.quotes.length;
      setQuote(state.quotes[state.activeQuoteIndex]);
      
      // Fade in
      quoteTextElem.classList.remove("quote-fade-out");
      quoteAuthorElem.classList.remove("quote-fade-out");
    }, 800); // sync with CSS transition duration
  }, 8000); // rotate every 8 seconds
}

function setQuote(quoteObj) {
  document.getElementById("quote-text").innerText = `"${quoteObj.text}"`;
  document.getElementById("quote-author").innerText = quoteObj.author;
}

// Adds pointer-driven rotation to the CSS archive bust.
function initPhilosopherModel() {
  const stage = document.getElementById("p-model-stage");
  const model = document.getElementById("p-model");
  if (!stage || !model) return;

  const resetModel = () => {
    model.style.setProperty("--model-turn", "-12deg");
    model.style.setProperty("--model-tilt", "2deg");
  };

  stage.addEventListener("pointermove", event => {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    model.style.setProperty("--model-turn", `${x * 48}deg`);
    model.style.setProperty("--model-tilt", `${y * -18}deg`);
  });

  stage.addEventListener("pointerleave", resetModel);
  stage.addEventListener("blur", resetModel);
  resetModel();
}

// 5. INTERACTIVE MAP CONTROLLER
function initMap() {
  if (typeof L === "undefined") {
    document.getElementById("map-container").innerHTML = `
      <div class="map-fallback">
        The cartographic map is unavailable offline. Search the archive or use a featured thinker to continue exploring.
      </div>
    `;
    return;
  }

  // Centers around central Afro-Eurasian coordinate space for global thinkers
  state.map = L.map("map-container", {
    center: [28.0, 50.0],
    zoom: 2.5,
    minZoom: 1.5,
    maxZoom: 9,
    scrollWheelZoom: true
  });
  
  // Inject CartoDB Dark Matter tile layer
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(state.map);
  
  // Add markers for each philosopher
  state.philosophers.forEach(p => {
    if (!Array.isArray(p.coordinates) || p.coordinates.length < 2) return;

    const goldIcon = L.divIcon({
      className: 'custom-gold-marker',
      html: '<div class="marker-pin"></div><div class="marker-inner"></div>',
      iconSize: [30, 42],
      iconAnchor: [15, 42],
      popupAnchor: [0, -35]
    });
    
    const marker = L.marker(p.coordinates, { icon: goldIcon }).addTo(state.map);
    
    const popupContent = `
      <div class="popup-title">${escapeHtml(p.name)}</div>
      <div style="font-size: 0.8rem; color:#8e8375; margin-bottom: 5px;">${escapeHtml(p.school)}</div>
      <a class="popup-link" href="#${p.id}">Examine Ledger</a>
    `;
    
    marker.bindPopup(popupContent);
    state.markers[p.id] = marker;
    
    // Clicking marker zooms and pulls up directory sidebar panel list
    marker.on("click", () => {
      selectHub(p.coordinates, p.region);
    });
  });
}

// Populates left cabinet with thinkers from selected hub
function selectHub(coordinates, regionName) {
  const cabinetList = document.getElementById("cabinet-list");
  const cabinetHubName = document.getElementById("current-hub-name");
  
  cabinetHubName.innerText = regionName;
  
  // Find all thinkers in the same region or sharing similar coordinates
  const matchingThinkers = state.philosophers.filter(p => {
    if (!Array.isArray(p.coordinates)) return false;
    const latDiff = Math.abs(p.coordinates[0] - coordinates[0]);
    const lngDiff = Math.abs(p.coordinates[1] - coordinates[1]);
    return latDiff < 0.2 && lngDiff < 0.2;
  });
  
  if (matchingThinkers.length === 0) {
    cabinetList.innerHTML = `<p class="empty-state">No records found for this location.</p>`;
    return;
  }
  
  cabinetList.innerHTML = matchingThinkers.map(p => `
    <div class="hub-philosopher-card ${state.activePhilosopherId === p.id ? 'active-hub-card' : ''}" data-id="${p.id}">
      <div class="hub-card-name">${escapeHtml(p.name)}</div>
      <div class="hub-card-meta">
        <span>${escapeHtml(p.era)}</span>
        <span>${escapeHtml(p.school)}</span>
      </div>
      <div class="hub-card-action"><i class="fa-solid fa-arrow-right"></i></div>
    </div>
  `).join("");
  
  // Bind click events to sidebar cards
  document.querySelectorAll(".hub-philosopher-card").forEach(card => {
    card.addEventListener("click", () => {
      const pId = card.getAttribute("data-id");
      window.location.hash = `#${pId}`;
    });
  });
  
  state.map.setView(coordinates, 4.5, { animate: true });
}

// 6. ROUTER & STATE CONTROLLER
function handleRouting() {
  const hash = window.location.hash.replace("#", "").toLowerCase();
  
  // Remove highlighted class from previous markers
  Object.keys(state.markers).forEach(id => {
    const m = state.markers[id];
    if (m._icon) {
      m._icon.classList.remove("active-marker");
    }
  });
  
  if (!hash) {
    state.activePhilosopherId = null;
    showWelcomeScreen();
    return;
  }
  
  const philosopher = state.philosophers.find(p => p.id === hash);
  if (!philosopher) {
    state.activePhilosopherId = null;
    showWelcomeScreen();
    return;
  }
  
  state.activePhilosopherId = philosopher.id;
  renderProfile(philosopher);
}

function showWelcomeScreen() {
  document.getElementById("ledger-active").classList.add("hidden");
  document.getElementById("ledger-welcome").classList.remove("hidden");
  
  // Reset hub list active states
  document.querySelectorAll(".hub-philosopher-card").forEach(c => c.classList.remove("active-hub-card"));
  
  // Center map on starting layout
  if (state.map) {
    state.map.setView([28.0, 50.0], 2.5, { animate: true });
  }
}

// Injects philosopher profile data into active ledger section
function renderProfile(p) {
  // Update UI sections
  document.getElementById("ledger-welcome").classList.add("hidden");
  const activeSection = document.getElementById("ledger-active");
  activeSection.classList.remove("hidden");
  
  // Header Meta
  document.getElementById("p-name").innerText = p.name;
  document.getElementById("p-school").innerText = p.school;
  document.getElementById("p-era").innerText = p.era;
  document.getElementById("p-region").innerText = p.region;
  document.getElementById("p-model-name").innerText = p.name;
  document.getElementById("p-model").className = `philosopher-bust model-${p.id}`;
  
  // Narrative Biography
  document.getElementById("p-bio-summary").innerText = p.biography?.summary || "No biography has been cataloged yet.";
  
  // Chronology / Timeline
  const timelineContainer = document.getElementById("p-timeline");
  timelineContainer.innerHTML = (p.biography?.timeline || []).map(item => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <span class="timeline-year">${escapeHtml(item.year)}</span>
      <p class="timeline-event">${escapeHtml(item.event)}</p>
    </div>
  `).join("");
  
  // Core Teachings Grid
  const teachingsContainer = document.getElementById("p-teachings");
  teachingsContainer.innerHTML = (p.teachings || []).map(t => `
    <div class="teaching-card">
      <h4 class="teaching-concept"><i class="fa-solid fa-feather"></i> ${escapeHtml(t.concept)}</h4>
      <p class="teaching-explanation">${escapeHtml(t.explanation)}</p>
    </div>
  `).join("");
  
  // Interactive 3D Book list
  const bookshelfContainer = document.getElementById("p-bookshelf");
  bookshelfContainer.innerHTML = (p.major_works || []).map((work, idx) => {
    const frontColor = work.cover_color;
    const spineColor = darkenColor(frontColor, 20);
    const backColor = darkenColor(frontColor, 10);
    
    return `
      <div class="bookshelf-row">
        <div class="book-container" title="Mousing over rotates the cover to show binding and edges">
          <div class="book-3d">
            <!-- Front Cover -->
            <div class="book-side book-front" style="background-color: ${frontColor};">
              <div class="book-title">${escapeHtml(work.title)}</div>
              <div class="book-published">${escapeHtml(work.published)}</div>
            </div>
            <!-- Leather Spine -->
            <div class="book-side book-spine" style="background-color: ${spineColor};">
              <div class="book-spine-decor-top">
                <div class="spine-rib"></div>
                <div class="spine-rib"></div>
              </div>
              <div class="book-spine-text">${escapeHtml(work.title)}</div>
              <div class="book-spine-decor-bottom">
                <div class="spine-rib"></div>
                <div class="spine-rib"></div>
              </div>
            </div>
            <!-- Back Cover -->
            <div class="book-side book-back" style="background-color: ${backColor};"></div>
            <!-- Custom Styled Edges -->
            <div class="book-side book-pages-right"></div>
            <div class="book-side book-pages-top"></div>
            <div class="book-side book-pages-bottom"></div>
          </div>
        </div>
        
        <div class="book-details">
          <h4 class="b-title">${escapeHtml(work.title)}</h4>
          <div class="b-meta">First Published: ${escapeHtml(work.published)}</div>
          <div class="b-gist-label">The Gist</div>
          <p class="b-gist">${escapeHtml(work.gist)}</p>
          
          <!-- Protected Spoiler UI -->
          <div class="spoiler-wrapper" id="spoiler-wrapper-${idx}">
            <div class="spoiler-header">
              <i class="fa-solid fa-eye-slash"></i> Philosophical Climax (Spoiler Alert)
            </div>
            <p class="spoiler-content">${escapeHtml(work.spoiler)}</p>
            <div class="spoiler-overlay">
              <button class="reveal-btn" data-index="${idx}">
                <i class="fa-solid fa-key"></i> Reveal Philosophical Climax
              </button>
              <span class="reveal-hint">Lifts the academic veil to reveal systemic conclusions</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
  
  // Set up listeners for the Reveal button in the ledger
  document.querySelectorAll(".reveal-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = btn.getAttribute("data-index");
      const wrapper = document.getElementById(`spoiler-wrapper-${idx}`);
      if (wrapper) {
        wrapper.classList.add("unlocked");
      }
    });
  });
  
  // Synchronize state markers & left hub cabinet list
  if (state.map && state.markers[p.id]) {
    const marker = state.markers[p.id];
    // Open Map Popup
    marker.openPopup();
    
    // Zoom/Center Map
    state.map.setView(p.coordinates, 6.5, { animate: true });
    
    // Highlight Active Marker
    if (marker._icon) {
      marker._icon.classList.add("active-marker");
    }
    
    // Populate Hub sidebar details
    selectHub(p.coordinates, p.region);
  }
  
  // Highlight card in hub list
  document.querySelectorAll(".hub-philosopher-card").forEach(c => {
    if (c.getAttribute("data-id") === p.id) {
      c.classList.add("active-hub-card");
      c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      c.classList.remove("active-hub-card");
    }
  });
  
  // Smoothly scroll the ledger container to top
  document.querySelector(".right-panel").scrollTo({ top: 0, behavior: "smooth" });
}

// 7. UNIFIED SEARCH MECHANISM
function initSearch() {
  const searchInput = document.getElementById("search-input");
  const clearBtn = document.getElementById("clear-search");
  const dropdown = document.getElementById("search-dropdown");
  
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (query === "") {
      clearBtn.style.display = "none";
      dropdown.classList.add("hidden");
      return;
    }
    
    clearBtn.style.display = "block";
    
    // Find matching records in details
    const matches = state.philosophers.filter(p => {
      return p.name.toLowerCase().includes(query) ||
             p.era.toLowerCase().includes(query) ||
             p.school.toLowerCase().includes(query) ||
             p.region.toLowerCase().includes(query) ||
             (p.teachings || []).some(t => t.concept.toLowerCase().includes(query) || t.explanation.toLowerCase().includes(query));
    });
    
    if (matches.length === 0) {
      dropdown.innerHTML = `<div class="search-result-item" style="color: var(--text-muted); cursor: default;">No records match your query.</div>`;
    } else {
      dropdown.innerHTML = matches.map(p => `
        <div class="search-result-item" data-id="${p.id}">
          <span class="s-res-name">${escapeHtml(p.name)}</span>
          <div class="s-res-meta">
            <span>${escapeHtml(p.school)}</span>
            <span>${escapeHtml(p.era)}</span>
          </div>
        </div>
      `).join("");
      
      // Dropdown match items click routing trigger
      dropdown.querySelectorAll(".search-result-item").forEach(item => {
        item.addEventListener("click", () => {
          const id = item.getAttribute("data-id");
          if (id) {
            window.location.hash = `#${id}`;
            clearSearch();
          }
        });
      });
    }
    
    dropdown.classList.remove("hidden");
  });
  
  // Close dropdown on click outside
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });
  
  clearBtn.addEventListener("click", clearSearch);
  
  function clearSearch() {
    searchInput.value = "";
    clearBtn.style.display = "none";
    dropdown.classList.add("hidden");
  }
}
