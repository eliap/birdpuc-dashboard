import { STATION_REGISTER, GRAPHQL_ENDPOINT, REVIEWS_ENDPOINT } from './config.js';
import { MISIDENTIFIED_SPECIES } from './misids.js';

// DOM refs
const tbody = document.getElementById('overview-table-body');
const projectFilter = document.getElementById('project-filter');
const statusView = document.getElementById('status-view');
const dataView = document.getElementById('data-view');
const dataCards = document.getElementById('data-cards');
const statusViewBtn = document.getElementById('status-view-btn');
const dataViewBtn = document.getElementById('data-view-btn');
const sortControl = document.getElementById('sort-control');
const sortSelect = document.getElementById('sort-select');
const misidControl = document.getElementById('misid-control');
const misidToggle = document.getElementById('misid-toggle');
const reviewViewBtn = document.getElementById('review-view-btn');
const reviewView = document.getElementById('review-view');
const reviewList = document.getElementById('review-list');
const reviewFilter = document.getElementById('review-filter');

// Modal refs
const timelineModal = document.getElementById('timeline-modal');
const timelineBackdrop = document.getElementById('timeline-backdrop');
const timelineClose = document.getElementById('timeline-close');
const timelineTitle = document.getElementById('timeline-title');
const timelineSubtitle = document.getElementById('timeline-subtitle');
const timelineContent = document.getElementById('timeline-content');

// Build a Set for fast misID lookups
const misidSet = new Set(MISIDENTIFIED_SPECIES.map(s => s.toLowerCase()));

// Cache fetched data so filtering doesn't re-fetch
let cachedStationData = [];
let cachedSpeciesData = [];
let cachedNewestSpecies = [];
let speciesDataLoaded = false;
let currentView = 'status';

// ─── Helpers ───
function isMisid(commonName) {
    return misidSet.has(commonName.toLowerCase());
}

function filterMisids(speciesList) {
    if (!misidToggle.checked) return speciesList;
    return speciesList.filter(s => !isMisid(s.species.commonName));
}

function speciesSlug(commonName) {
    return commonName.toLowerCase().replace(/['']/g, '').replace(/\s+/g, '-');
}

function birdweatherUrl(commonName) {
    return `https://app.birdweather.com/species/${speciesSlug(commonName)}`;
}

function formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }) +
        ' ' + d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// Currently playing audio element (so we can stop previous when starting new)
let currentAudio = null;
// Web Audio API context for volume boost
let audioCtx = null;
const AUDIO_GAIN = 4.0; // 4x volume boost

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatWeek(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ─── Project Filter ───
function populateProjectFilter() {
    const projects = [...new Set(STATION_REGISTER.map(s => s.project).filter(Boolean))];
    projects.sort();
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project;
        option.textContent = project;
        projectFilter.appendChild(option);
    });
}

// ─── View Toggle ───
const allViewBtns = [statusViewBtn, dataViewBtn, reviewViewBtn];
const allViews = { status: statusView, data: dataView, review: reviewView };

function setView(view) {
    currentView = view;

    // Hide all views
    Object.values(allViews).forEach(v => v.classList.add('hidden'));
    // Deactivate all buttons
    allViewBtns.forEach(btn => {
        btn.classList.remove('bg-teal-600', 'text-white');
        btn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    });

    // Show data-view-only controls only in data view
    const showDataControls = view === 'data';
    sortControl.classList.toggle('hidden', !showDataControls);
    sortControl.classList.toggle('flex', showDataControls);
    misidControl.classList.toggle('hidden', !showDataControls);
    misidControl.classList.toggle('flex', showDataControls);

    // Activate selected view
    allViews[view].classList.remove('hidden');
    const activeBtn = { status: statusViewBtn, data: dataViewBtn, review: reviewViewBtn }[view];
    activeBtn.classList.add('bg-teal-600', 'text-white');
    activeBtn.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');

    if (view === 'data') {
        if (!speciesDataLoaded) loadSpeciesData();
        else displayCards(projectFilter.value);
    } else if (view === 'review') {
        loadReviews();
    }
}

statusViewBtn.addEventListener('click', () => setView('status'));
dataViewBtn.addEventListener('click', () => setView('data'));
reviewViewBtn.addEventListener('click', () => setView('review'));

// ─── Status View (existing) ───
async function fetchStationData(station) {
    const query = `
        query CheckStatus($stationId: ID!, $arrParam: [ID!]!, $period: InputDuration) {
            station(id: $stationId) {
                sensors {
                    system {
                        timestamp
                    }
                }
            }
            dailyDetectionCounts(stationIds: $arrParam, period: $period) {
                date
                total
            }
        }
    `;
    const variables = {
        stationId: String(station.id),
        arrParam: [String(station.id)],
        period: { count: 7, unit: "day" }
    };
    try {
        const res = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const json = await res.json();
        let isLive = false;
        let daysActive = 0;
        if (!json.errors && json.data.station?.sensors?.system) {
            const lastHeartbeat = json.data.station.sensors.system.timestamp;
            if (lastHeartbeat) {
                const differenceInHours = (new Date() - new Date(lastHeartbeat)) / (1000 * 60 * 60);
                if (differenceInHours <= 2) isLive = true;
            }
        }
        if (!json.errors && json.data.dailyDetectionCounts) {
            for (const day of json.data.dailyDetectionCounts) {
                if (day.total > 0) daysActive++;
            }
        }
        return { isLive, daysActive };
    } catch (err) {
        console.error(`Error for ${station.id}:`, err);
        return { isLive: false, daysActive: 0 };
    }
}

function displayTable(filterProject) {
    tbody.innerHTML = '';
    STATION_REGISTER.forEach((station, index) => {
        if (filterProject !== 'all' && station.project !== filterProject) return;
        const data = cachedStationData[index];
        if (!data) return;

        const statusBadge = data.isLive
            ? `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-50 text-green-800 border border-green-200 shadow-sm"><span class="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>Live</span>`
            : `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-800 border border-red-200 shadow-sm"><span class="w-2 h-2 rounded-full bg-red-500 mr-2"></span>Offline</span>`;

        let activityColor = "bg-red-50 text-red-800 border-red-200";
        if (data.daysActive >= 5) activityColor = "bg-green-50 text-green-800 border-green-200";
        else if (data.daysActive >= 3) activityColor = "bg-yellow-50 text-yellow-800 border-yellow-200";
        else if (data.daysActive > 0) activityColor = "bg-orange-50 text-orange-800 border-orange-200";

        const activityBadge = `<span class="inline-block px-3 py-1 rounded-md text-sm font-semibold border ${activityColor} shadow-sm">${data.daysActive} / 7 Days</span>`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors duration-150";
        tr.innerHTML = `
            <td class="py-4 px-6 font-bold text-teal-800 whitespace-nowrap">${station.name}</td>
            <td class="py-4 px-6 text-center">${statusBadge}</td>
            <td class="py-4 px-6 text-center">${activityBadge}</td>
            <td class="py-4 px-6 text-slate-700">${station.project}</td>
            <td class="py-4 px-6 text-slate-600">${station.site || '<span class="italic text-slate-400">Unassigned</span>'}</td>
        `;
        tbody.appendChild(tr);
    });
    if (tbody.children.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400 italic">No PUCs found for this project.</td></tr>`;
    }
}

async function renderTable() {
    cachedStationData = await Promise.all(STATION_REGISTER.map(s => fetchStationData(s)));
    displayTable(projectFilter.value);
}

// ─── Data View ───
async function fetchSpeciesData(station) {
    const today = new Date().toISOString().split('T')[0];
    let period;
    if (station.installed) {
        period = { from: station.installed, to: today };
    } else {
        period = { count: 3, unit: "month" };
    }

    const query = `
        query TopSpecies($stationIds: [ID!]!, $period: InputDuration, $limit: Int) {
            topSpecies(stationIds: $stationIds, period: $period, limit: $limit) {
                species {
                    id
                    commonName
                    scientificName
                }
                count
            }
        }
    `;
    const variables = {
        stationIds: [String(station.id)],
        period,
        limit: 200
    };
    try {
        const res = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const json = await res.json();
        if (!json.errors && json.data.topSpecies) {
            return json.data.topSpecies;
        }
        return [];
    } catch (err) {
        console.error(`Species error for ${station.id}:`, err);
        return [];
    }
}

// Fetch recent detections with audio for a species at a station
async function fetchDetections(stationId, speciesId, installedDate) {
    const today = new Date().toISOString().split('T')[0];
    const period = installedDate ? { from: installedDate, to: today } : { count: 3, unit: "month" };
    const query = `
        query Detections($stationIds: [ID!]!, $speciesId: ID!, $period: InputDuration) {
            detections(stationIds: $stationIds, speciesId: $speciesId, period: $period, first: 10, validSoundscape: true) {
                edges {
                    node {
                        id
                        timestamp
                        confidence
                        score
                        soundscape {
                            url
                            duration
                            startTime
                            endTime
                        }
                    }
                }
            }
        }
    `;
    try {
        const res = await fetch(GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { stationIds: [String(stationId)], speciesId: String(speciesId), period } })
        });
        const json = await res.json();
        if (!json.errors && json.data.detections) {
            return json.data.detections.edges.map(e => e.node);
        }
    } catch (err) {
        console.error(`Detections error:`, err);
    }
    return [];
}

// Find the newest species added by comparing topSpecies across time windows
async function fetchNewestSpecies(station, fullSpeciesList) {
    if (!station.installed || fullSpeciesList.length === 0) return null;

    const today = new Date().toISOString().split('T')[0];

    // Apply misID filter if enabled
    const filteredFull = filterMisids(fullSpeciesList);
    if (filteredFull.length === 0) return null;

    const windows = [7, 14, 28, 56];
    const labels = ['this week', 'in last 2 weeks', 'in last month', 'in last 2 months'];

    const query = `
        query TopSpecies($stationIds: [ID!]!, $period: InputDuration, $limit: Int) {
            topSpecies(stationIds: $stationIds, period: $period, limit: $limit) {
                species { commonName }
                count
            }
        }
    `;

    for (let i = 0; i < windows.length; i++) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - windows[i]);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        if (cutoffStr <= station.installed) {
            return { name: null, label: 'all detected early on' };
        }

        try {
            const res = await fetch(GRAPHQL_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    query,
                    variables: {
                        stationIds: [String(station.id)],
                        period: { from: station.installed, to: cutoffStr },
                        limit: 200
                    }
                })
            });
            const json = await res.json();
            if (!json.errors && json.data.topSpecies) {
                const shorterNames = new Set(json.data.topSpecies.map(s => s.species.commonName));
                const newSpecies = filteredFull.filter(s => !shorterNames.has(s.species.commonName));

                if (newSpecies.length > 0) {
                    newSpecies.sort((a, b) => a.count - b.count);
                    return {
                        name: newSpecies[0].species.commonName,
                        count: newSpecies[0].count,
                        total: newSpecies.length,
                        label: labels[i]
                    };
                }
            }
        } catch (err) {
            console.error(`Newest species error for ${station.id}:`, err);
        }
    }
    return { name: null, label: 'all detected early on' };
}

// ─── Species Timeline (weekly resolution) ───
async function fetchSpeciesTimeline(station, fullSpeciesList) {
    if (!station.installed || fullSpeciesList.length === 0) return [];

    const today = new Date();
    const installDate = new Date(station.installed + 'T00:00:00');

    // Build weekly cumulative intervals from install date to today
    const weeks = [];
    const cursor = new Date(installDate);
    while (cursor < today) {
        const weekEnd = new Date(cursor);
        weekEnd.setDate(weekEnd.getDate() + 7);
        if (weekEnd > today) weekEnd.setTime(today.getTime());
        weeks.push({
            from: station.installed,
            to: weekEnd.toISOString().split('T')[0],
            label: formatWeek(cursor.toISOString().split('T')[0])
        });
        cursor.setDate(cursor.getDate() + 7);
    }

    const query = `
        query TopSpecies($stationIds: [ID!]!, $period: InputDuration, $limit: Int) {
            topSpecies(stationIds: $stationIds, period: $period, limit: $limit) {
                species { id commonName scientificName }
                count
            }
        }
    `;

    // Fetch cumulative species lists in batches
    const cumulativeResults = [];
    const batchSize = 4;
    for (let i = 0; i < weeks.length; i += batchSize) {
        const batch = weeks.slice(i, i + batchSize).map(async (week) => {
            try {
                const res = await fetch(GRAPHQL_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query,
                        variables: {
                            stationIds: [String(station.id)],
                            period: { from: week.from, to: week.to },
                            limit: 200
                        }
                    })
                });
                const json = await res.json();
                if (!json.errors && json.data.topSpecies) {
                    return { week: week.label, to: week.to, species: json.data.topSpecies };
                }
            } catch (err) {
                console.error(`Timeline error for ${station.id}:`, err);
            }
            return { week: week.label, to: week.to, species: [] };
        });
        const results = await Promise.all(batch);
        cumulativeResults.push(...results);
    }

    // Diff successive cumulative lists to find when each species first appeared
    const seen = new Set();
    const timeline = [];

    for (const result of cumulativeResults) {
        for (const entry of result.species) {
            const name = entry.species.commonName;
            if (!seen.has(name)) {
                seen.add(name);
                const fullEntry = fullSpeciesList.find(s => s.species.commonName === name);
                timeline.push({
                    speciesId: entry.species.id,
                    commonName: name,
                    scientificName: entry.species.scientificName,
                    firstWeek: result.week,
                    firstTo: result.to,
                    count: fullEntry ? fullEntry.count : entry.count
                });
            }
        }
    }

    // Reverse so newest first
    timeline.reverse();
    return timeline;
}

// ─── Timeline Modal ───
function openTimelineModal(station, stationIndex) {
    timelineModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    timelineTitle.textContent = `${station.name} — Detection Timeline`;
    timelineSubtitle.textContent = `${station.site || station.project} · Installed ${formatDate(station.installed)}`;
    timelineContent.innerHTML = `<div class="text-center text-slate-500 py-8"><span class="animate-pulse">Loading detection timeline (weekly resolution)...</span></div>`;

    const speciesList = cachedSpeciesData[stationIndex] || [];
    const filtered = filterMisids(speciesList);

    fetchSpeciesTimeline(station, filtered).then(timeline => {
        if (timeline.length === 0) {
            timelineContent.innerHTML = `<p class="text-slate-400 italic text-center py-8">No species data available.</p>`;
            return;
        }

        const hidingMisids = misidToggle.checked;
        let html = `<p class="text-xs text-slate-400 mb-4">${timeline.length} species detected, newest first${hidingMisids ? ' (misIDs hidden)' : ''}. Click a species to load recent calls.</p>`;
        html += `<div class="space-y-0">`;

        let lastWeek = null;
        for (const entry of timeline) {
            if (entry.firstWeek !== lastWeek) {
                lastWeek = entry.firstWeek;
                html += `<div class="pt-3 pb-1 flex items-center gap-2">
                    <span class="text-xs font-semibold text-teal-600 uppercase tracking-wider whitespace-nowrap">Week of ${entry.firstWeek}</span>
                    <div class="flex-1 border-t border-slate-200"></div>
                </div>`;
            }

            html += `
                <div class="species-row">
                    <button class="species-expand-btn w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-teal-50 transition-colors text-left"
                            data-species-id="${entry.speciesId}" data-species-name="${entry.commonName}" data-station-id="${station.id}" data-installed="${station.installed || ''}">
                        <div class="flex-1 min-w-0">
                            <span class="text-slate-800 font-medium">${entry.commonName}</span>
                            <span class="text-slate-400 text-xs ml-2 italic">${entry.scientificName}</span>
                        </div>
                        <div class="flex items-center gap-2 ml-3 flex-shrink-0">
                            <span class="text-slate-500 text-sm font-mono">${entry.count.toLocaleString()}</span>
                            <svg class="expand-chevron h-4 w-4 text-slate-300 transition-transform" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </div>
                    </button>
                    <div class="species-detections hidden pl-3 pr-3 pb-2"></div>
                </div>
            `;
        }
        html += `</div>`;
        timelineContent.innerHTML = html;

        // Attach expand handlers
        timelineContent.querySelectorAll('.species-expand-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const detDiv = btn.parentElement.querySelector('.species-detections');
                const chevron = btn.querySelector('.expand-chevron');

                // Toggle
                if (!detDiv.classList.contains('hidden')) {
                    detDiv.classList.add('hidden');
                    chevron.classList.remove('rotate-180');
                    // Stop any playing audio
                    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
                    return;
                }

                // Collapse other open rows
                timelineContent.querySelectorAll('.species-detections').forEach(d => d.classList.add('hidden'));
                timelineContent.querySelectorAll('.expand-chevron').forEach(c => c.classList.remove('rotate-180'));
                if (currentAudio) { currentAudio.pause(); currentAudio = null; }

                chevron.classList.add('rotate-180');
                detDiv.classList.remove('hidden');
                detDiv.innerHTML = '<p class="text-slate-400 text-xs py-2 animate-pulse">Loading recent calls...</p>';

                const speciesId = btn.dataset.speciesId;
                const stationId = btn.dataset.stationId;
                const installed = btn.dataset.installed;
                const speciesName = btn.dataset.speciesName;
                const detections = await fetchDetections(stationId, speciesId, installed || null);

                if (detections.length === 0) {
                    detDiv.innerHTML = '<p class="text-slate-400 text-xs py-2 italic">No recordings with audio found.</p>';
                    return;
                }

                let detHtml = `<div class="border-l-2 border-teal-200 ml-2 pl-3 space-y-2 mt-1">`;
                detections.forEach((det, i) => {
                    const scoreColor = det.score >= 7 ? 'text-green-600' : det.score >= 5 ? 'text-amber-600' : 'text-red-500';
                    const confPct = Math.round(det.confidence * 100);
                    detHtml += `
                        <div class="flex items-center gap-2 py-1">
                            <button class="play-btn flex-shrink-0 w-8 h-8 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors shadow-sm"
                                    data-audio-url="${det.soundscape?.url || ''}" data-start="${det.soundscape?.startTime || 0}" data-end="${det.soundscape?.endTime || 3}" data-idx="${i}">
                                <svg class="play-icon h-4 w-4 ml-0.5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </button>
                            <div class="flex-1 min-w-0">
                                <span class="text-slate-600 text-xs">${formatTime(det.timestamp)}</span>
                                <div class="flex gap-2 text-xs">
                                    <span class="${scoreColor} font-semibold">Score ${det.score.toFixed(1)}</span>
                                    <span class="text-slate-400">${confPct}% conf</span>
                                </div>
                            </div>
                            <button class="flag-btn flex-shrink-0 w-7 h-7 rounded-full hover:bg-amber-50 text-slate-300 hover:text-amber-500 flex items-center justify-center transition-colors"
                                    data-det-json='${JSON.stringify({ id: det.id, timestamp: det.timestamp, score: det.score, confidence: det.confidence, soundscape: det.soundscape }).replace(/'/g, "&#39;")}'
                                    data-species-name="${speciesName}" data-species-id="${speciesId}" data-station-id="${stationId}" data-station-name="${STATION_REGISTER.find(s => String(s.id) === String(stationId))?.name || ''}"
                                    title="Flag for review">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                </svg>
                            </button>
                        </div>
                    `;
                });
                detHtml += `</div>`;
                detDiv.innerHTML = detHtml;

                // Attach play handlers
                detDiv.querySelectorAll('.play-btn').forEach(playBtn => {
                    playBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const url = playBtn.dataset.audioUrl;
                        const start = parseFloat(playBtn.dataset.start);
                        const end = parseFloat(playBtn.dataset.end);
                        if (!url) return;

                        // Stop previous
                        if (currentAudio) {
                            currentAudio.pause();
                            // Reset previous button icon
                            document.querySelectorAll('.play-btn .play-icon').forEach(icon => {
                                icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                            });
                        }

                        const audio = new Audio(url);
                        audio.crossOrigin = 'anonymous';
                        currentAudio = audio;

                        // Route through Web Audio API gain node for volume boost
                        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        const source = audioCtx.createMediaElementSource(audio);
                        const gainNode = audioCtx.createGain();
                        gainNode.gain.value = AUDIO_GAIN;
                        source.connect(gainNode);
                        gainNode.connect(audioCtx.destination);

                        // Change icon to pause
                        const icon = playBtn.querySelector('.play-icon');
                        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

                        audio.addEventListener('loadedmetadata', () => {
                            audio.currentTime = start;
                            audio.play();
                        });

                        // Stop at end time
                        audio.addEventListener('timeupdate', () => {
                            if (audio.currentTime >= end) {
                                audio.pause();
                                icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                                currentAudio = null;
                            }
                        });

                        audio.addEventListener('ended', () => {
                            icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                            currentAudio = null;
                        });

                        audio.addEventListener('error', () => {
                            icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                            currentAudio = null;
                        });
                    });
                });

                // Attach flag handlers
                detDiv.querySelectorAll('.flag-btn').forEach(flagBtn => {
                    flagBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const det = JSON.parse(flagBtn.dataset.detJson);
                        const specName = flagBtn.dataset.speciesName;
                        const specId = flagBtn.dataset.speciesId;
                        const statId = flagBtn.dataset.stationId;
                        const statName = flagBtn.dataset.stationName;

                        flagBtn.innerHTML = '<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';
                        const ok = await flagDetection(det, specName, specId, statName, statId);
                        if (ok) {
                            flagBtn.classList.add('text-amber-500');
                            flagBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>';
                            flagBtn.title = 'Flagged for review';
                            flagBtn.disabled = true;
                        } else {
                            flagBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>';
                            alert('Failed to flag detection');
                        }
                    });
                });
            });
        });
    });
}

function closeTimelineModal() {
    timelineModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

timelineClose.addEventListener('click', closeTimelineModal);
timelineBackdrop.addEventListener('click', closeTimelineModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !timelineModal.classList.contains('hidden')) {
        closeTimelineModal();
    }
});

// ─── Card Building ───
function buildCard(station, speciesList, newestSpecies, stationIndex) {
    const filtered = filterMisids(speciesList);
    const totalSpecies = filtered.length;
    const top5 = filtered.slice(0, 5);
    const bottom5 = totalSpecies > 5 ? filtered.slice(-5).reverse() : [];

    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col';

    let html = `
        <div class="bg-teal-50 px-5 py-4 border-b border-slate-200">
            <h3 class="font-bold text-xl text-teal-800">${station.name}</h3>
            <p class="text-slate-600 text-sm mt-1">${station.project}</p>
        </div>
        <div class="px-5 py-4 flex-1 flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div>
                    <span class="text-slate-500">Site</span>
                    <p class="font-medium text-slate-800">${station.site || '<span class="italic text-slate-400">Unassigned</span>'}</p>
                </div>
                <div>
                    <span class="text-slate-500">Installed</span>
                    <p class="font-medium text-slate-800">${formatDate(station.installed)}</p>
                </div>
            </div>

            <div class="bg-teal-50 rounded-lg px-4 py-3 text-center">
                <span class="text-3xl font-bold text-teal-700">${totalSpecies}</span>
                <span class="text-sm text-teal-600 ml-1">species detected</span>
            </div>
    `;

    // Newest species — clickable to open timeline
    if (newestSpecies && newestSpecies.name) {
        html += `
            <button class="timeline-btn bg-amber-50 rounded-lg px-4 py-3 border border-amber-200 text-left hover:bg-amber-100 transition-colors cursor-pointer w-full" data-station-index="${stationIndex}">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Newest Species Added</h4>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                </div>
                <p class="text-amber-900 font-semibold">${newestSpecies.name}</p>
                <p class="text-amber-600 text-xs mt-1">Detected ${newestSpecies.label} (${newestSpecies.count} detection${newestSpecies.count !== 1 ? 's' : ''}) · Click for full timeline</p>
            </button>
        `;
    } else if (newestSpecies) {
        html += `
            <button class="timeline-btn bg-slate-50 rounded-lg px-4 py-3 border border-slate-200 text-left hover:bg-slate-100 transition-colors cursor-pointer w-full" data-station-index="${stationIndex}">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Newest Species Added</h4>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                </div>
                <p class="text-slate-400 text-sm italic">All species detected early on</p>
                <p class="text-slate-400 text-xs mt-1">Click for full timeline</p>
            </button>
        `;
    } else if (station.installed) {
        html += `
            <button class="timeline-btn bg-slate-50 rounded-lg px-4 py-3 border border-slate-200 text-left hover:bg-slate-100 transition-colors cursor-pointer w-full" data-station-index="${stationIndex}">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Species Timeline</h4>
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                </div>
                <p class="text-slate-400 text-sm animate-pulse">Loading...</p>
            </button>
        `;
    }

    // Species link helper
    function speciesLink(s) {
        const url = birdweatherUrl(s.species.commonName);
        return `
            <a href="${url}" target="_blank" rel="noopener"
               class="flex justify-between items-center text-sm py-1 hover:text-teal-700 transition-colors group">
                <span class="text-slate-800 group-hover:text-teal-700">${s.species.commonName}</span>
                <span class="text-slate-500 font-mono text-xs">${s.count.toLocaleString()}</span>
            </a>
        `;
    }

    if (top5.length > 0) {
        html += `
            <div>
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Top 5 Most Common</h4>
                <div class="space-y-0 divide-y divide-slate-100">
                    ${top5.map(s => speciesLink(s)).join('')}
                </div>
            </div>
        `;
    }

    if (bottom5.length > 0) {
        html += `
            <div>
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">5 Least Common</h4>
                <div class="space-y-0 divide-y divide-slate-100">
                    ${bottom5.map(s => speciesLink(s)).join('')}
                </div>
            </div>
        `;
    }

    if (totalSpecies === 0) {
        html += `<p class="text-slate-400 italic text-sm text-center py-4">No species data available</p>`;
    }

    html += `</div>`;
    card.innerHTML = html;

    // Attach timeline click handler
    const timelineBtn = card.querySelector('.timeline-btn');
    if (timelineBtn) {
        timelineBtn.addEventListener('click', () => {
            const idx = parseInt(timelineBtn.dataset.stationIndex);
            openTimelineModal(STATION_REGISTER[idx], idx);
        });
    }

    return card;
}

function displayCards(filterProject) {
    dataCards.innerHTML = '';

    let items = STATION_REGISTER.map((station, index) => ({ station, index }));
    if (filterProject !== 'all') {
        items = items.filter(item => item.station.project === filterProject);
    }

    const sortVal = sortSelect.value;
    items.sort((a, b) => {
        if (sortVal === 'name-asc') return a.station.name.localeCompare(b.station.name);
        if (sortVal === 'name-desc') return b.station.name.localeCompare(a.station.name);
        const aCount = filterMisids(cachedSpeciesData[a.index] || []).length;
        const bCount = filterMisids(cachedSpeciesData[b.index] || []).length;
        if (sortVal === 'species-desc') return bCount - aCount;
        if (sortVal === 'species-asc') return aCount - bCount;
        return 0;
    });

    items.forEach(({ station, index }) => {
        const speciesList = cachedSpeciesData[index] || [];
        const newest = cachedNewestSpecies[index] || null;
        dataCards.appendChild(buildCard(station, speciesList, newest, index));
    });

    if (items.length === 0) {
        dataCards.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 italic">No PUCs found for this project.</div>`;
    }
}

async function loadSpeciesData() {
    dataCards.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500"><span class="animate-pulse">Loading species data...</span></div>`;
    cachedSpeciesData = await Promise.all(STATION_REGISTER.map(s => fetchSpeciesData(s)));

    cachedNewestSpecies = new Array(STATION_REGISTER.length).fill(null);
    speciesDataLoaded = true;
    displayCards(projectFilter.value);

    // Fetch newest species in batches
    const batchSize = 6;
    for (let i = 0; i < STATION_REGISTER.length; i += batchSize) {
        const batch = STATION_REGISTER.slice(i, i + batchSize).map((station, j) => {
            const idx = i + j;
            return fetchNewestSpecies(station, cachedSpeciesData[idx]).then(result => {
                cachedNewestSpecies[idx] = result;
            });
        });
        await Promise.all(batch);
    }
    displayCards(projectFilter.value);
}

// ─── Review System ───
let cachedReviews = [];

function getReviewerName() {
    let name = localStorage.getItem('birdpuc-reviewer');
    if (!name) {
        name = prompt('Enter your name (used to track who flagged/reviewed detections):');
        if (name) localStorage.setItem('birdpuc-reviewer', name.trim());
    }
    return name ? name.trim() : 'Anonymous';
}

async function fetchReviews() {
    try {
        const res = await fetch(REVIEWS_ENDPOINT);
        const data = await res.json();
        cachedReviews = data;
        return data;
    } catch (err) {
        console.error('Error fetching reviews:', err);
        return [];
    }
}

async function postReview(body) {
    try {
        const res = await fetch(REVIEWS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (err) {
        console.error('Error posting review:', err);
        return { success: false };
    }
}

async function flagDetection(detection, speciesName, speciesId, stationName, stationId) {
    const reviewer = getReviewerName();
    const body = {
        action: 'flag',
        detectionId: detection.id,
        stationName,
        stationId: String(stationId),
        speciesName,
        speciesId: String(speciesId),
        timestamp: detection.timestamp,
        audioUrl: detection.soundscape?.url || '',
        startTime: detection.soundscape?.startTime || 0,
        endTime: detection.soundscape?.endTime || 3,
        score: detection.score,
        confidence: detection.confidence,
        reviewer
    };
    const result = await postReview(body);
    return result.success;
}

async function submitReview(detectionId, status, correction) {
    const reviewedBy = getReviewerName();
    const body = {
        action: 'review',
        detectionId: String(detectionId),
        status,
        correction: correction || '',
        reviewedBy
    };
    const result = await postReview(body);
    return result.success;
}

async function loadReviews() {
    reviewList.innerHTML = '<div class="py-12 text-center text-slate-500"><span class="animate-pulse">Loading reviews...</span></div>';
    const reviews = await fetchReviews();
    displayReviews(reviews);
}

function displayReviews(reviews) {
    const filterVal = reviewFilter.value;
    let filtered = reviews;
    if (filterVal !== 'all') {
        filtered = reviews.filter(r => r.status === filterVal);
    }

    if (filtered.length === 0) {
        reviewList.innerHTML = `<div class="py-12 text-center text-slate-400 italic">
            ${reviews.length === 0 ? 'No flagged detections yet. Flag a detection from the species timeline in Data View.' : 'No detections match this filter.'}
        </div>`;
        return;
    }

    reviewList.innerHTML = '';
    filtered.forEach(review => {
        const row = document.createElement('div');
        row.className = 'px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 hover:bg-slate-50 transition-colors';

        const statusBadge = {
            needs_review: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Needs Review</span>',
            confirmed: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Confirmed</span>',
            incorrect: '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Incorrect</span>'
        }[review.status] || '';

        const scoreColor = review.score >= 7 ? 'text-green-600' : review.score >= 5 ? 'text-amber-600' : 'text-red-500';
        const confPct = Math.round((review.confidence || 0) * 100);
        const flaggedDate = review.flaggedAt ? new Date(review.flaggedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';

        row.innerHTML = `
            <div class="flex items-center gap-3 flex-shrink-0">
                <button class="review-play-btn flex-shrink-0 w-10 h-10 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center transition-colors shadow-sm"
                        data-audio-url="${review.audioUrl || ''}" data-start="${review.startTime || 0}" data-end="${review.endTime || 3}">
                    <svg class="play-icon h-5 w-5 ml-0.5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </button>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-slate-800">${review.speciesName || 'Unknown'}</span>
                    ${statusBadge}
                </div>
                <div class="flex items-center gap-3 text-xs text-slate-500 mt-1">
                    <span>${review.stationName || ''}</span>
                    <span class="${scoreColor} font-semibold">Score ${Number(review.score || 0).toFixed(1)}</span>
                    <span>${confPct}% conf</span>
                    <span>Flagged by ${review.reviewer || '?'} ${flaggedDate}</span>
                </div>
                ${review.correction ? `<p class="text-xs text-slate-600 mt-1 italic">${review.correction}</p>` : ''}
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                ${review.status === 'needs_review' ? `
                    <button class="review-confirm-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors" data-detection-id="${review.detectionId}">
                        Correct
                    </button>
                    <button class="review-incorrect-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors" data-detection-id="${review.detectionId}">
                        Incorrect
                    </button>
                ` : ''}
            </div>
        `;

        reviewList.appendChild(row);
    });

    // Attach play handlers
    reviewList.querySelectorAll('.review-play-btn').forEach(playBtn => {
        playBtn.addEventListener('click', () => {
            const url = playBtn.dataset.audioUrl;
            const start = parseFloat(playBtn.dataset.start);
            const end = parseFloat(playBtn.dataset.end);
            if (!url) return;

            if (currentAudio) {
                currentAudio.pause();
                document.querySelectorAll('.play-icon').forEach(icon => {
                    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                });
            }

            const audio = new Audio(url);
            audio.crossOrigin = 'anonymous';
            currentAudio = audio;

            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaElementSource(audio);
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = AUDIO_GAIN;
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const icon = playBtn.querySelector('.play-icon');
            icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

            audio.addEventListener('loadedmetadata', () => {
                audio.currentTime = start;
                audio.play();
            });
            audio.addEventListener('timeupdate', () => {
                if (audio.currentTime >= end) {
                    audio.pause();
                    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
                    currentAudio = null;
                }
            });
            audio.addEventListener('ended', () => { icon.innerHTML = '<path d="M8 5v14l11-7z"/>'; currentAudio = null; });
            audio.addEventListener('error', () => { icon.innerHTML = '<path d="M8 5v14l11-7z"/>'; currentAudio = null; });
        });
    });

    // Attach confirm/incorrect handlers
    reviewList.querySelectorAll('.review-confirm-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            btn.textContent = '...';
            btn.disabled = true;
            const ok = await submitReview(btn.dataset.detectionId, 'confirmed', '');
            if (ok) loadReviews();
            else { btn.textContent = 'Correct'; btn.disabled = false; alert('Failed to submit review'); }
        });
    });

    reviewList.querySelectorAll('.review-incorrect-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const correction = prompt('What species do you think this actually is? (optional)');
            if (correction === null) return; // cancelled
            btn.textContent = '...';
            btn.disabled = true;
            const ok = await submitReview(btn.dataset.detectionId, 'incorrect', correction);
            if (ok) loadReviews();
            else { btn.textContent = 'Incorrect'; btn.disabled = false; alert('Failed to submit review'); }
        });
    });
}

reviewFilter.addEventListener('change', () => {
    displayReviews(cachedReviews);
});

// ─── Shared Controls ───
populateProjectFilter();

projectFilter.addEventListener('change', () => {
    if (currentView === 'status') displayTable(projectFilter.value);
    else displayCards(projectFilter.value);
});

sortSelect.addEventListener('change', () => {
    displayCards(projectFilter.value);
});

misidToggle.addEventListener('change', () => {
    if (currentView === 'data') {
        // Re-render cards immediately with new filter state
        displayCards(projectFilter.value);
        // Re-fetch newest species in background with updated filter
        cachedNewestSpecies = new Array(STATION_REGISTER.length).fill(null);
        const batchSize = 6;
        (async () => {
            for (let i = 0; i < STATION_REGISTER.length; i += batchSize) {
                const batch = STATION_REGISTER.slice(i, i + batchSize).map((station, j) => {
                    const idx = i + j;
                    return fetchNewestSpecies(station, cachedSpeciesData[idx]).then(result => {
                        cachedNewestSpecies[idx] = result;
                    });
                });
                await Promise.all(batch);
            }
            displayCards(projectFilter.value);
        })();
    }
});

document.getElementById('refresh-btn').addEventListener('click', () => {
    if (currentView === 'status') {
        tbody.innerHTML = `<tr id="loading-row"><td colspan="5" class="py-12 text-center text-slate-500"><span class="inline-block animate-pulse">Refreshing BirdPuc Data...</span></td></tr>`;
        renderTable();
    } else if (currentView === 'review') {
        loadReviews();
    } else {
        speciesDataLoaded = false;
        cachedNewestSpecies = [];
        loadSpeciesData();
    }
});

// Boot
renderTable();
