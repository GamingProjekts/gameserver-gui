document.getElementById('connect-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const ip = document.getElementById('ip').value;
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const statusDiv = document.getElementById('connection-status');
    const terminalContainer = document.getElementById('terminal-container');
    const terminalDiv = document.getElementById('terminal');

    const ws = new WebSocket(`ws://localhost:3000/ssh?ip=${encodeURIComponent(ip)}&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);

    ws.onopen = () => {
        statusDiv.textContent = 'SSH-Verbindung hergestellt.';
        statusDiv.style.color = 'green';
        terminalContainer.style.display = 'block';
    };

    ws.onmessage = (event) => {
        const message = document.createElement('div');
        message.textContent = event.data;
        terminalDiv.appendChild(message);
        terminalDiv.scrollTop = terminalDiv.scrollHeight;
    };

    ws.onerror = (error) => {
        statusDiv.textContent = `Fehler: ${error.message}`;
        statusDiv.style.color = 'red';
    };

    ws.onclose = () => {
        statusDiv.textContent = 'Verbindung geschlossen.';
        statusDiv.style.color = 'orange';
    };

    terminalDiv.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            ws.send(event.target.value + '\n');
            event.target.value = '';
        }
    });
});
