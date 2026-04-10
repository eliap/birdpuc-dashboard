import { STATION_REGISTER, GRAPHQL_ENDPOINT } from './config.js';

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

// Cache fetched data so filtering doesn't re-fetch
let cachedStationData = [];
let cachedSpeciesData = [];
let cachedNewestSpecies = [];
let speciesDataLoaded = false;
let currentView = 'status';

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
function setView(view) {
    currentView = view;
    if (view === 'status') {
        statusView.classList.remove('hidden');
        dataView.classList.add('hidden');
        sortControl.classList.add('hidden');
        sortControl.classList.remove('flex');
        statusViewBtn.classList.add('bg-teal-600', 'text-white');
        statusViewBtn.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');
        dataViewBtn.classList.remove('bg-teal-600', 'text-white');
        dataViewBtn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
    } else {
        statusView.classList.add('hidden');
        dataView.classList.remove('hidden');
        sortControl.classList.remove('hidden');
        sortControl.classList.add('flex');
        dataViewBtn.classList.add('bg-teal-600', 'text-white');
        dataViewBtn.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-50');
        statusViewBtn.classList.remove('bg-teal-600', 'text-white');
        statusViewBtn.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-50');
        if (!speciesDataLoaded) loadSpeciesData();
        else displayCards(projectFilter.value);
    }
}

statusViewBtn.addEventListener('click', () => setView('status'));
dataViewBtn.addEventListener('click', () => setView('data'));

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
    // Build period from install date to today, or fallback to last 3 months
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

// Find the newest species added by comparing topSpecies across time windows
async function fetchNewestSpecies(station, fullSpeciesList) {
    if (!station.installed || fullSpeciesList.length === 0) return null;

    const today = new Date().toISOString().split('T')[0];
    const fullNames = new Set(fullSpeciesList.map(s => s.species.commonName));

    // Time windows to check: 1 week, 2 weeks, 4 weeks, 8 weeks
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

        // Skip if cutoff is before install date
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
                const newSpecies = fullSpeciesList.filter(s => !shorterNames.has(s.species.commonName));

                if (newSpecies.length > 0) {
                    // Pick the one with fewest total detections (most likely the very newest)
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
    // No new species found in any window — all appeared early
    return { name: null, label: 'all detected early on' };
}

function formatDate(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildCard(station, speciesList, newestSpecies) {
    const totalSpecies = speciesList.length;
    const top5 = speciesList.slice(0, 5);
    const bottom5 = totalSpecies > 5 ? speciesList.slice(-5).reverse() : [];

    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col';

    // Header
    let html = `
        <div class="bg-teal-50 px-5 py-4 border-b border-slate-200">
            <h3 class="font-bold text-xl text-teal-800">${station.name}</h3>
            <p class="text-slate-600 text-sm mt-1">${station.project}</p>
        </div>
        <div class="px-5 py-4 flex-1 flex flex-col gap-4">
            <!-- Meta -->
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

            <!-- Species count -->
            <div class="bg-teal-50 rounded-lg px-4 py-3 text-center">
                <span class="text-3xl font-bold text-teal-700">${totalSpecies}</span>
                <span class="text-sm text-teal-600 ml-1">species detected</span>
            </div>
    `;

    // Newest species
    if (newestSpecies && newestSpecies.name) {
        html += `
            <div class="bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
                <h4 class="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Newest Species Added</h4>
                <p class="text-amber-900 font-semibold">${newestSpecies.name}</p>
                <p class="text-amber-600 text-xs mt-1">Detected ${newestSpecies.label} (${newestSpecies.count} detection${newestSpecies.count !== 1 ? 's' : ''})</p>
            </div>
        `;
    } else if (newestSpecies) {
        html += `
            <div class="bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Newest Species Added</h4>
                <p class="text-slate-400 text-sm italic">All species detected early on</p>
            </div>
        `;
    }

    // Top 5
    if (top5.length > 0) {
        html += `
            <div>
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Top 5 Most Common</h4>
                <ul class="space-y-1">
                    ${top5.map((s, i) => `
                        <li class="flex justify-between items-center text-sm py-1 ${i < top5.length - 1 ? 'border-b border-slate-100' : ''}">
                            <span class="text-slate-800">${s.species.commonName}</span>
                            <span class="text-slate-500 font-mono text-xs">${s.count.toLocaleString()}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // Bottom 5 (least common)
    if (bottom5.length > 0) {
        html += `
            <div>
                <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">5 Least Common</h4>
                <ul class="space-y-1">
                    ${bottom5.map((s, i) => `
                        <li class="flex justify-between items-center text-sm py-1 ${i < bottom5.length - 1 ? 'border-b border-slate-100' : ''}">
                            <span class="text-slate-700">${s.species.commonName}</span>
                            <span class="text-slate-400 font-mono text-xs">${s.count.toLocaleString()}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    // No data state
    if (totalSpecies === 0) {
        html += `<p class="text-slate-400 italic text-sm text-center py-4">No species data available</p>`;
    }

    html += `</div>`;
    card.innerHTML = html;
    return card;
}

function displayCards(filterProject) {
    dataCards.innerHTML = '';

    // Build filtered list with original indices (for species data lookup)
    let items = STATION_REGISTER.map((station, index) => ({ station, index }));
    if (filterProject !== 'all') {
        items = items.filter(item => item.station.project === filterProject);
    }

    // Sort
    const sortVal = sortSelect.value;
    items.sort((a, b) => {
        if (sortVal === 'name-asc') return a.station.name.localeCompare(b.station.name);
        if (sortVal === 'name-desc') return b.station.name.localeCompare(a.station.name);
        const aCount = (cachedSpeciesData[a.index] || []).length;
        const bCount = (cachedSpeciesData[b.index] || []).length;
        if (sortVal === 'species-desc') return bCount - aCount;
        if (sortVal === 'species-asc') return aCount - bCount;
        return 0;
    });

    items.forEach(({ station, index }) => {
        const speciesList = cachedSpeciesData[index] || [];
        const newest = cachedNewestSpecies[index] || null;
        dataCards.appendChild(buildCard(station, speciesList, newest));
    });

    if (items.length === 0) {
        dataCards.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 italic">No PUCs found for this project.</div>`;
    }
}

async function loadSpeciesData() {
    dataCards.innerHTML = `<div class="col-span-full py-12 text-center text-slate-500"><span class="animate-pulse">Loading species data...</span></div>`;
    cachedSpeciesData = await Promise.all(STATION_REGISTER.map(s => fetchSpeciesData(s)));

    // Render cards immediately with species data, then load newest species in background
    cachedNewestSpecies = new Array(STATION_REGISTER.length).fill(null);
    speciesDataLoaded = true;
    displayCards(projectFilter.value);

    // Fetch newest species for each station (in parallel, max 6 at a time to be polite)
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
    // Re-render with newest species data
    displayCards(projectFilter.value);
}

// ─── Shared Controls ───
populateProjectFilter();

projectFilter.addEventListener('change', () => {
    if (currentView === 'status') displayTable(projectFilter.value);
    else displayCards(projectFilter.value);
});

sortSelect.addEventListener('change', () => {
    displayCards(projectFilter.value);
});

document.getElementById('refresh-btn').addEventListener('click', () => {
    if (currentView === 'status') {
        tbody.innerHTML = `<tr id="loading-row"><td colspan="5" class="py-12 text-center text-slate-500"><span class="inline-block animate-pulse">Refreshing BirdPuc Data...</span></td></tr>`;
        renderTable();
    } else {
        speciesDataLoaded = false;
        cachedNewestSpecies = [];
        loadSpeciesData();
    }
});

// Boot
renderTable();
