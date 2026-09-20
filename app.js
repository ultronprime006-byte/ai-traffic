/**
 * AI Smart Traffic Signal & Emergency Corridor Optimizer - 860+ Delhi Signals Network
 * Frontend Application Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global Application State
  let allJunctions = [];
  let allBlackspots = [];
  let allHospitals = [];
  let allCorridors = [];
  
  let selectedJunctionId = 'j1';
  let emergencyActive = false;
  let activePhase = 'North';
  let activePhaseIndex = 0;
  const phases = ['North', 'East', 'South', 'West'];
  
  let countdownTimer = 45;
  let timerInterval = null;
  let isYellowPhase = false;
  let currentMapEngine = 'leaflet';

  let allocatedTimes = {
    'North': 45,
    'East': 50,
    'South': 32,
    'West': 38
  };

  // Map & Cluster Objects
  let map = null;
  let gMap = null;
  let markerClusterGroup = null; // Leaflet MarkerCluster Group for 860+ signals
  let junctionMarkers = {};
  let blackspotMarkers = {};
  let hospitalMarkers = {};
  let trafficPolylines = [];
  
  let emergencyPolyline = null;
  let emergencyVehicleMarker = null;
  let emergencyAnimationTimer = null;
  let analyticsChart = null;

  // DOM Elements
  const elLiveClock = document.getElementById('live-clock');
  const elStatusBadge = document.getElementById('system-status-badge');
  const elStatusText = document.getElementById('system-status-text');
  
  const elBtnEmergency = document.getElementById('btn-emergency-trigger');
  const elEmergencyBtnText = document.getElementById('emergency-btn-text');
  const elEmergencyBanner = document.getElementById('emergency-banner');
  const elBtnCancelEmergency = document.getElementById('btn-cancel-emergency');

  const elSelectJunction = document.getElementById('select-junction');
  const elCurrentJName = document.getElementById('current-j-name');
  const elCurrentJZone = document.getElementById('current-j-zone');
  const elCurrentJId = document.getElementById('current-j-id');

  const elSliderNorth = document.getElementById('slider-north');
  const elSliderSouth = document.getElementById('slider-south');
  const elSliderEast = document.getElementById('slider-east');
  const elSliderWest = document.getElementById('slider-west');

  const elValNorth = document.getElementById('val-north');
  const elValSouth = document.getElementById('val-south');
  const elValEast = document.getElementById('val-east');
  const elValWest = document.getElementById('val-west');

  const elAllocNorth = document.getElementById('alloc-north');
  const elAllocSouth = document.getElementById('alloc-south');
  const elAllocEast = document.getElementById('alloc-east');
  const elAllocWest = document.getElementById('alloc-west');

  const elLensRed = document.getElementById('lens-red');
  const elLensYellow = document.getElementById('lens-yellow');
  const elLensGreen = document.getElementById('lens-green');

  const elActivePhaseName = document.getElementById('active-phase-name');
  const elCountdownTimer = document.getElementById('countdown-timer');
  const elAllocatedTime = document.getElementById('allocated-time');
  const elKpiAiWait = document.getElementById('kpi-ai-wait');

  const elBtnEngineLeaflet = document.getElementById('btn-engine-leaflet');
  const elBtnEngineGmaps = document.getElementById('btn-engine-gmaps');
  const elGmapsKeyPanel = document.getElementById('gmaps-key-panel');
  const elInputGmapsKey = document.getElementById('input-gmaps-key');
  const elBtnLoadGmaps = document.getElementById('btn-load-gmaps');

  // 1. Live IST Clock Initialization
  function initClock() {
    function update() {
      const now = new Date();
      elLiveClock.textContent = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
    }
    update();
    setInterval(update, 1000);
  }

  // 2. Fetch 860+ Signals & Map Datasets from Backend
  async function loadDataFromBackend() {
    try {
      const res = await fetch('/api/junctions');
      const data = await res.json();
      if (data.status === 'success') {
        allJunctions = data.junctions || [];
        allBlackspots = data.blackspots || [];
        allHospitals = data.hospitals || [];
        allCorridors = data.corridors || [];

        populateJunctionDropdown();
        initLeafletMap();
      }
    } catch (err) {
      console.warn('Failed to load 860+ backend data:', err);
    }
  }

  function populateJunctionDropdown() {
    elSelectJunction.innerHTML = '';
    const zones = {};
    allJunctions.forEach(j => {
      const z = j.zone || 'Delhi-NCR';
      if (!zones[z]) zones[z] = [];
      zones[z].push(j);
    });

    Object.keys(zones).forEach(zName => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = `${zName} (${zones[zName].length} Signals)`;
      // Render first 40 per zone for UI dropdown performance
      zones[zName].slice(0, 40).forEach(j => {
        const option = document.createElement('option');
        option.value = j.id;
        option.textContent = `${j.name} (${j.id.toUpperCase()})`;
        optgroup.appendChild(option);
      });
      elSelectJunction.appendChild(optgroup);
    });

    elSelectJunction.value = selectedJunctionId;
    elSelectJunction.addEventListener('change', (e) => {
      selectJunction(e.target.value);
    });
  }

  function selectJunction(jId) {
    selectedJunctionId = jId;
    const target = allJunctions.find(j => j.id === jId);
    if (!target) return;

    elCurrentJName.textContent = target.name;
    elCurrentJZone.textContent = target.zone || 'Delhi-NCR';
    elCurrentJId.textContent = target.id.toUpperCase();

    const d = target.densities;
    elSliderNorth.value = d.North; elValNorth.textContent = d.North;
    elSliderSouth.value = d.South; elValSouth.textContent = d.South;
    elSliderEast.value = d.East; elValEast.textContent = d.East;
    elSliderWest.value = d.West; elValWest.textContent = d.West;

    if (currentMapEngine === 'leaflet' && map) {
      map.flyTo([target.lat, target.lng], 15, { duration: 1 });
      if (junctionMarkers[jId]) junctionMarkers[jId].openPopup();
    }
    triggerAiCalculation();
  }

  // 3. Leaflet MarkerCluster Initialization for 860+ Signals & CartoDB Dark Tiles
  function initLeafletMap() {
    if (map) {
      map.remove();
      map = null;
    }

    map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([28.6139, 77.2090], 11);

    // Reliable CartoDB Dark Matter Tile Layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Invalidate size to guarantee map computes canvas properly after DOM render
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 300);



    // Render Live Congestion Polylines across 860 Network
    renderTrafficPolylines();

    // Create MarkerCluster Group for 860+ signals
    if (markerClusterGroup) map.removeLayer(markerClusterGroup);
    
    markerClusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      chunkInterval: 100,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false
    });

    junctionMarkers = {};
    const emergencyIds = ["j21", "j23", "j25", "j13", "j12", "j11"];

    // Add 860+ signal markers into cluster group
    allJunctions.forEach(j => {
      const isCorridor = emergencyIds.includes(j.id);
      const icon = createSignalIcon(emergencyActive && isCorridor);

      const marker = L.marker([j.lat, j.lng], { icon: icon });
      marker.bindPopup(`
        <div class="p-2.5 max-w-[210px]">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-500/30">${j.zone}</span>
          <h4 class="font-bold text-sm text-emerald-400 mt-1 mb-1">${j.name}</h4>
          <p class="text-xs text-gray-300 mb-2">Signal ID: <strong class="text-white">${j.id.toUpperCase()}</strong></p>
          <button onclick="window.selectJunctionFromPin('${j.id}')" class="w-full py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition">
            Control Intersection
          </button>
        </div>
      `);

      marker.on('click', () => { selectJunction(j.id); });
      junctionMarkers[j.id] = marker;
      markerClusterGroup.addLayer(marker);
    });

    map.addLayer(markerClusterGroup);

    // Render 87 Accident Blackspots (Hazards Red Badges)
    blackspotMarkers = {};
    allBlackspots.forEach(b => {
      const icon = createBlackspotIcon();
      const marker = L.marker([b.lat, b.lng], { icon: icon }).addTo(map);
      marker.bindPopup(`
        <div class="p-2.5 max-w-[240px]">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-500/40">${b.risk}</span>
          <h4 class="font-bold text-sm text-rose-400 mt-1 mb-1">⚠️ ${b.name}</h4>
          <p class="text-xs text-gray-200 mb-1">Fatalities/Yr: <strong class="text-rose-300">${b.fatalities_yr}</strong></p>
          <p class="text-xs text-gray-400 mb-2">Nearest Trauma Unit: <strong class="text-cyan-300">${b.nearest_hospital}</strong></p>
          <button onclick="window.triggerEmergencyFromBlackspot()" class="w-full py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded transition">
            Engage 860+ Trauma Corridor
          </button>
        </div>
      `);
      blackspotMarkers[b.id] = marker;
    });

    // Render 10 Emergency Trauma Hospitals (Blue Cross Badges)
    hospitalMarkers = {};
    allHospitals.forEach(h => {
      const icon = createHospitalIcon();
      const marker = L.marker([h.lat, h.lng], { icon: icon }).addTo(map);
      marker.bindPopup(`
        <div class="p-2.5 max-w-[220px]">
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">EMERGENCY TRAUMA</span>
          <h4 class="font-bold text-sm text-cyan-400 mt-1 mb-1">🏥 ${h.name}</h4>
          <p class="text-xs text-gray-300 mb-1">${h.type}</p>
          <p class="text-xs text-emerald-400 font-semibold">ICU & Emergency Beds: ${h.emergency_beds}</p>
        </div>
      `);
      hospitalMarkers[h.id] = marker;
    });

    if (emergencyActive) drawEmergencyCorridor();
  }

  // Window helpers for popup button clicks
  window.selectJunctionFromPin = (id) => { selectJunction(id); };
  window.triggerEmergencyFromBlackspot = () => { toggleEmergencyCorridor(true); };

  // 4. Live Traffic Congestion Polylines (Google Maps Style Neon Color Coding)
  function renderTrafficPolylines() {
    trafficPolylines.forEach(p => map.removeLayer(p));
    trafficPolylines = [];

    allCorridors.forEach(c => {
      let color = '#00FF66'; // Green Neon Smooth (<40%)
      if (c.density > 70) color = '#FF0055'; // Red Neon Heavy (>70%)
      else if (c.density >= 40) color = '#FFAA00'; // Orange Neon Moderate (40-70%)

      const line = L.polyline(c.path, {
        color: color,
        weight: 5,
        opacity: 0.85,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      line.bindTooltip(`
        <div class="text-xs font-bold font-mono-num p-1">
          ${c.name}<br>
          Traffic Congestion: <span style="color:${color}">${c.density}%</span>
        </div>
      `, { sticky: true });

      trafficPolylines.push(line);
    });
  }

  // Marker Icon Generators
  function createSignalIcon(isEmergency = false) {
    const color = isEmergency ? '#ef4444' : '#10b981';
    const bgGlow = isEmergency ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.35)';
    
    return L.divIcon({
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: ${bgGlow}; animation: ping 2.5s infinite;"></div>
          <div style="width: 18px; height: 18px; border-radius: 50%; background: ${color}; border: 2px solid #ffffff; box-shadow: 0 0 10px ${color}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 9px;">
            🚦
          </div>
        </div>
      `,
      className: 'custom-junction-marker',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
  }

  function createBlackspotIcon() {
    return L.divIcon({
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;">
          <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(244, 63, 94, 0.5); animation: ping 1.5s infinite;"></div>
          <div style="width: 26px; height: 26px; border-radius: 50%; background: #be123c; border: 2px solid #fecdd3; box-shadow: 0 0 15px #f43f5e; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 13px;">
            ⚠️
          </div>
        </div>
      `,
      className: 'custom-blackspot-marker',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function createHospitalIcon() {
    return L.divIcon({
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
          <div style="width: 24px; height: 24px; border-radius: 50%; background: #0284c7; border: 2px solid #ffffff; box-shadow: 0 0 12px #38bdf8; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">
            🏥
          </div>
        </div>
      `,
      className: 'custom-hospital-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  // 5. 860+ Network Emergency Trauma Corridor Simulation
  function drawEmergencyCorridor() {
    const traumaRouteCoords = [
      [28.7369, 77.1610], // Mukarba Chowk Blackspot (j21)
      [28.7065, 77.1810], // Azadpur (j23)
      [28.6675, 77.1250], // Punjabi Bagh (j25)
      [28.5918, 77.1616], // Dhaula Kuan (j13)
      [28.5835, 77.1700], // Moti Bagh (j12)
      [28.5680, 77.2110]  // AIIMS Apex Trauma Center (h1)

    ];

    if (currentMapEngine === 'leaflet' && map) {
      if (emergencyPolyline) map.removeLayer(emergencyPolyline);
      
      emergencyPolyline = L.polyline(traumaRouteCoords, {
        color: '#f43f5e',
        weight: 7,
        opacity: 0.95,
        dashArray: '10, 10',
        lineCap: 'round',
        className: 'emergency-corridor-path'
      }).addTo(map);

      map.fitBounds(emergencyPolyline.getBounds(), { padding: [50, 50] });

      if (emergencyVehicleMarker) map.removeLayer(emergencyVehicleMarker);

      const ambulanceIcon = L.divIcon({
        html: `<div style="font-size: 28px; filter: drop-shadow(0 0 15px #f43f5e); animation: bounce 1s infinite;">🚑</div>`,
        className: 'ambulance-marker',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      emergencyVehicleMarker = L.marker(traumaRouteCoords[0], { icon: ambulanceIcon }).addTo(map);

      let step = 0;
      const stepsPerSegment = 25;
      const totalSegments = traumaRouteCoords.length - 1;
      const totalSteps = stepsPerSegment * totalSegments;

      if (emergencyAnimationTimer) clearInterval(emergencyAnimationTimer);

      emergencyAnimationTimer = setInterval(() => {
        step = (step + 1) % (totalSteps * 2);
        let progress = step / totalSteps;
        if (progress > 1) progress = 2 - progress;

        const currentSegment = Math.min(Math.floor(progress * totalSegments), totalSegments - 1);
        const segmentProgress = (progress * totalSegments) - currentSegment;

        const p1 = traumaRouteCoords[currentSegment];
        const p2 = traumaRouteCoords[currentSegment + 1];

        const currentPos = [
          p1[0] + (p2[0] - p1[0]) * segmentProgress,
          p1[1] + (p2[1] - p1[1]) * segmentProgress
        ];

        if (emergencyVehicleMarker) emergencyVehicleMarker.setLatLng(currentPos);
      }, 50);
    }
  }

  function toggleEmergencyCorridor(active) {
    emergencyActive = active;

    if (active) {
      elStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/60 text-rose-300 text-xs font-semibold animate-pulse';
      elStatusText.textContent = '860+ TRAUMA CORRIDOR ACTIVE';

      elBtnEmergency.classList.add('active');
      elEmergencyBtnText.textContent = 'CANCEL EMERGENCY OVERRIDE';
      elEmergencyBanner.classList.remove('hidden');

      drawEmergencyCorridor();

      setTrafficSignalVisual('GREEN');
      elActivePhaseName.textContent = 'TRAUMA CORRIDOR (ALL GREEN)';
      elActivePhaseName.className = 'text-lg font-bold text-rose-400 mb-2 animate-pulse';
      elCountdownTimer.textContent = '60s';

    } else {
      elStatusBadge.className = 'flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-semibold';
      elStatusText.textContent = '860+ SIGNALS CLUSTERED';

      elBtnEmergency.classList.remove('active');
      elEmergencyBtnText.textContent = 'SIMULATE EMERGENCY VEHICLE';
      elEmergencyBanner.classList.add('hidden');

      if (currentMapEngine === 'leaflet' && map) {
        if (emergencyPolyline) map.removeLayer(emergencyPolyline);
        if (emergencyVehicleMarker) map.removeLayer(emergencyVehicleMarker);
        if (emergencyAnimationTimer) clearInterval(emergencyAnimationTimer);
      }

      setTrafficSignalVisual('GREEN');
      elActivePhaseName.className = 'text-lg font-bold text-emerald-400 mb-2';
      activePhaseIndex = 0;
      activePhase = phases[0];
      countdownTimer = allocatedTimes[activePhase];
      updatePhaseUI();
    }
  }

  // 6. Signal Visual Box
  function setTrafficSignalVisual(state) {
    elLensRed.className = 'signal-lens';
    elLensYellow.className = 'signal-lens';
    elLensGreen.className = 'signal-lens';

    if (state === 'RED') elLensRed.classList.add('red-active');
    else if (state === 'YELLOW') elLensYellow.classList.add('yellow-active');
    else if (state === 'GREEN') elLensGreen.classList.add('green-active');
  }

  // 7. Signal Timer Loop
  function startSignalTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (emergencyActive) return;

      if (countdownTimer > 0) {
        countdownTimer--;
        elCountdownTimer.textContent = `${countdownTimer}s`;

        if (countdownTimer <= 3 && !isYellowPhase) {
          isYellowPhase = true;
          setTrafficSignalVisual('YELLOW');
        }
      } else {
        isYellowPhase = false;
        activePhaseIndex = (activePhaseIndex + 1) % phases.length;
        activePhase = phases[activePhaseIndex];

        countdownTimer = allocatedTimes[activePhase] || 25;
        setTrafficSignalVisual('GREEN');
        updatePhaseUI();
      }
    }, 1000);
  }

  function updatePhaseUI() {
    elActivePhaseName.textContent = `${activePhase.toUpperCase()} DIRECTION (GREEN)`;
    elCountdownTimer.textContent = `${countdownTimer}s`;
    elAllocatedTime.textContent = `${allocatedTimes[activePhase]}s`;
  }

  // 8. AI Calculation API Call
  async function triggerAiCalculation() {
    const densities = {
      North: parseInt(elSliderNorth.value),
      South: parseInt(elSliderSouth.value),
      East: parseInt(elSliderEast.value),
      West: parseInt(elSliderWest.value)
    };

    try {
      const response = await fetch('/api/calculate-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ junction_id: selectedJunctionId, densities })
      });

      const data = await response.json();
      if (data.status === 'success') {
        allocatedTimes = data.ai_allocation;

        elAllocNorth.textContent = `${allocatedTimes.North}s`;
        elAllocSouth.textContent = `${allocatedTimes.South}s`;
        elAllocEast.textContent = `${allocatedTimes.East}s`;
        elAllocWest.textContent = `${allocatedTimes.West}s`;

        elAllocatedTime.textContent = `${allocatedTimes[activePhase]}s`;

        if (data.analytics) {
          elKpiAiWait.textContent = `${data.analytics.ai_dynamic_wait_time}s`;
          updateChartData(data.analytics.fixed_wait_time, data.analytics.ai_dynamic_wait_time);
        }
      }
    } catch (err) {
      console.warn('API calculation fallback:', err);
    }
  }

  // 9. Slider & Preset Event Listeners
  const sliders = [elSliderNorth, elSliderSouth, elSliderEast, elSliderWest];
  const valueDisplays = [elValNorth, elValSouth, elValEast, elValWest];

  sliders.forEach((slider, idx) => {
    slider.addEventListener('input', (e) => {
      valueDisplays[idx].textContent = e.target.value;
      triggerAiCalculation();
    });
  });

  document.getElementById('preset-rush').addEventListener('click', () => {
    setSliderValues(85, 60, 95, 70);
  });
  document.getElementById('preset-balanced').addEventListener('click', () => {
    setSliderValues(35, 35, 35, 35);
  });
  document.getElementById('preset-clear').addEventListener('click', () => {
    setSliderValues(15, 12, 18, 10);
  });

  function setSliderValues(n, s, e, w) {
    elSliderNorth.value = n; elValNorth.textContent = n;
    elSliderSouth.value = s; elValSouth.textContent = s;
    elSliderEast.value = e; elValEast.textContent = e;
    elSliderWest.value = w; elValWest.textContent = w;
    triggerAiCalculation();
  }

  // Emergency Button Handler
  elBtnEmergency.addEventListener('click', async () => {
    const nextState = !emergencyActive;
    try {
      await fetch('/api/emergency-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextState ? 'enable' : 'disable' })
      });
    } catch (err) {
      console.warn('Emergency API call fallback:', err);
    }
    toggleEmergencyCorridor(nextState);
  });

  // Map Engine Switch Handlers
  function switchToLeaflet() {
    currentMapEngine = 'leaflet';
    if (elBtnEngineLeaflet) elBtnEngineLeaflet.className = 'px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/40 transition';
    if (elBtnEngineGmaps) elBtnEngineGmaps.className = 'px-2.5 py-1 rounded-md text-gray-400 hover:text-white transition';
    if (elGmapsKeyPanel) elGmapsKeyPanel.classList.add('hidden');
    initLeafletMap();
  }

  function loadGoogleMaps(apiKey) {
    if (!apiKey) return;
    if (window.google && window.google.maps) {
      initGoogleMap();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initGoogleMapCallback`;
    script.async = true;
    script.defer = true;
    
    window.initGoogleMapCallback = () => {
      initGoogleMap();
    };

    script.onerror = () => {
      console.warn('Google Maps API failed. Reverting to CartoDB dark Leaflet mode.');
      switchToLeaflet();
    };

    document.head.appendChild(script);
  }

  function initGoogleMap() {
    currentMapEngine = 'gmaps';
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    mapDiv.innerHTML = '';

    gMap = new google.maps.Map(mapDiv, {
      center: { lat: 28.6139, lng: 77.2090 },
      zoom: 12,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] }
      ]
    });

    allJunctions.forEach(j => {
      const marker = new google.maps.Marker({
        position: { lat: j.lat, lng: j.lng },
        map: gMap,
        title: j.name
      });
      marker.addListener('click', () => { selectJunction(j.id); });
    });
  }

  if (elBtnEngineLeaflet) elBtnEngineLeaflet.addEventListener('click', switchToLeaflet);
  if (elBtnEngineGmaps) {
    elBtnEngineGmaps.addEventListener('click', () => {
      elBtnEngineGmaps.className = 'px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-300 font-medium border border-cyan-500/40 transition';
      if (elBtnEngineLeaflet) elBtnEngineLeaflet.className = 'px-2.5 py-1 rounded-md text-gray-400 hover:text-white transition';
      if (elGmapsKeyPanel) elGmapsKeyPanel.classList.remove('hidden');
    });
  }
  if (elBtnLoadGmaps && elInputGmapsKey) {
    elBtnLoadGmaps.addEventListener('click', () => {
      const key = elInputGmapsKey.value.trim();
      if (key) loadGoogleMaps(key);
    });
  }

  // 10. Chart.js Performance Analytics Initialization

  function initChart() {
    const ctx = document.getElementById('analyticsChart').getContext('2d');
    
    analyticsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Fixed-Timer Wait Time', 'AI Dynamic Wait Time', 'Emergency Mode'],
        datasets: [{
          label: 'Average Wait Time (Seconds)',
          data: [45, 22, 0],
          backgroundColor: [
            'rgba(244, 63, 94, 0.75)',
            'rgba(16, 185, 129, 0.85)',
            'rgba(6, 186, 212, 0.85)'
          ],
          borderColor: ['#f43f5e', '#10b981', '#06b6d4'],
          borderWidth: 2,
          borderRadius: 8,
          barThickness: 45
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
            bodyFont: { family: 'JetBrains Mono', size: 12 },
            padding: 12,
            borderColor: 'rgba(56, 189, 248, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: (context) => `Wait Time: ${context.parsed.y} Seconds`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 12 } }
          },
          y: {
            beginAtZero: true,
            max: 60,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: {
              color: '#9ca3af',
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (val) => val + 's'
            }
          }
        }
      }
    });
  }

  function updateChartData(fixedWait, aiWait) {
    if (analyticsChart) {
      analyticsChart.data.datasets[0].data = [fixedWait, aiWait, emergencyActive ? 0 : 0];
      analyticsChart.update();
    }
  }

  // --- Start App Initialization ---
  initClock();
  initChart();
  loadDataFromBackend();
  startSignalTimer();
});
