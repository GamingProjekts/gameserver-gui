// Tab-Steuerung
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
        const targetTab = document.getElementById(button.dataset.tab);
        if (targetTab) {
            targetTab.classList.remove('hidden');
        }
    });
});

// Server hinzufügen
document.getElementById('add-server-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const serverName = document.getElementById('server-name').value;
    const game = document.getElementById('game').value;
    const version = document.getElementById('version').value;
    const type = document.getElementById('type').value;

    try {
        const response = await fetch('/api/add-server', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ serverName, game, version, type }),
        });

        const result = await response.json();
        if (response.ok) {
            alert(`Server hinzugefügt: ${result.message}`);
            loadDashboard();
        } else {
            alert(`Fehler: ${result.error}`);
        }
    } catch (error) {
        alert(`Fehler: ${error.message}`);
    }
});

// Dashboard laden
async function loadDashboard() {
    try {
        const response = await fetch('/api/scan-screens');
        const result = await response.json();

        const statusDiv = document.getElementById('server-status');
        statusDiv.innerHTML = '';
        result.servers.forEach(server => {
            const serverDiv = document.createElement('div');
            serverDiv.innerHTML = `
                <strong>${server.name}</strong> - ${server.running ? 'Läuft' : 'Gestoppt'}
                <br>Pfad: ${server.path}
                <br>Screen: ${server.screen || 'Keiner'}
            `;
            statusDiv.appendChild(serverDiv);
        });
    } catch (error) {
        console.error('Fehler beim Laden des Dashboards:', error);
    }
}

// Server verwalten
async function loadServerList() {
    const response = await fetch('/api/servers');
    const servers = await response.json();

    const serverList = document.getElementById('server-list');
    serverList.innerHTML = '';
    servers.forEach(server => {
        const li = document.createElement('li');
        li.textContent = `${server.name} (${server.game} - ${server.version}) [${server.type}]`;

        const startButton = document.createElement('button');
        startButton.textContent = 'Starten';
        startButton.addEventListener('click', () => manageServer(server.name, 'start'));

        const stopButton = document.createElement('button');
        stopButton.textContent = 'Stoppen';
        stopButton.addEventListener('click', () => manageServer(server.name, 'stop'));

        li.appendChild(startButton);
        li.appendChild(stopButton);
        serverList.appendChild(li);
    });
}

async function manageServer(name, action) {
    const response = await fetch('/api/screen', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, action }),
    });

    const result = await response.json();
    if (response.ok) {
        alert(`Aktion erfolgreich: ${result.message}`);
        loadDashboard();
    } else {
        alert(`Fehler: ${result.error}`);
    }
}

// Initialisierung
loadDashboard();
loadServerList();
