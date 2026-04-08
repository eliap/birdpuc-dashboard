import { STATION_REGISTER, GRAPHQL_ENDPOINT } from './config.js';

const tbody = document.getElementById('overview-table-body');
const projectFilter = document.getElementById('project-filter');

// Cache fetched data so filtering doesn't re-fetch
let cachedStationData = [];

// Populate project filter dropdown from config
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

// Fetch function querying both realtime heartbeat and 7-day activity
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
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query, variables })
        });

        const json = await res.json();

        let isLive = false;
        let daysActive = 0;

        // 1. Calculate Live Heartbeat Status
        if (!json.errors && json.data.station && json.data.station.sensors && json.data.station.sensors.system) {
            const lastHeartbeat = json.data.station.sensors.system.timestamp;
            if (lastHeartbeat) {
                const heartbeatDate = new Date(lastHeartbeat);
                const now = new Date();
                const differenceInHours = (now - heartbeatDate) / (1000 * 60 * 60);
                if (differenceInHours <= 2) {
                    isLive = true;
                }
            }
        }

        // 2. Calculate 7-Day Activity
        if (!json.errors && json.data.dailyDetectionCounts) {
            for (const day of json.data.dailyDetectionCounts) {
                if (day.total > 0) {
                    daysActive++;
                }
            }
        }

        return { isLive, daysActive };
    } catch (err) {
        console.error(`Error for ${station.id}:`, err);
        return { isLive: false, daysActive: 0 };
    }
}

// Render table rows, optionally filtered by project
function displayTable(filterProject) {
    tbody.innerHTML = '';

    STATION_REGISTER.forEach((station, index) => {
        // Apply project filter
        if (filterProject !== 'all' && station.project !== filterProject) return;

        const data = cachedStationData[index];
        if (!data) return; // Data not yet loaded

        // Status Badge
        const statusBadge = data.isLive
            ? `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-50 text-green-800 border border-green-200 shadow-sm"><span class="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>Live</span>`
            : `<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-red-50 text-red-800 border border-red-200 shadow-sm"><span class="w-2 h-2 rounded-full bg-red-500 mr-2"></span>Offline</span>`;

        // Activity Badge
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

    // Show empty state if no rows match
    if (tbody.children.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="py-12 text-center text-slate-400 italic">No PUCs found for this project.</td>
            </tr>
        `;
    }
}

// Fetch all data and render
async function renderTable() {
    const dataPromises = STATION_REGISTER.map(s => fetchStationData(s));
    cachedStationData = await Promise.all(dataPromises);
    displayTable(projectFilter.value);
}

// Populate filter on load
populateProjectFilter();

// Boot up
renderTable();

// Project Filter Change
projectFilter.addEventListener('change', () => {
    displayTable(projectFilter.value);
});

// Refresh Button Logic
document.getElementById('refresh-btn').addEventListener('click', () => {
    tbody.innerHTML = `
        <tr id="loading-row">
            <td colspan="5" class="py-12 text-center text-slate-500">
                <span class="inline-block animate-pulse">Refreshing BirdPuc Data...</span>
            </td>
        </tr>
    `;
    renderTable();
});
