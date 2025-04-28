const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Client } = require('ssh2');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const app = express();
app.use(express.json());

const servers = []; // Temporäre Speicherung der Server

// Statische Dateien aus dem Frontend-Ordner bereitstellen
app.use(express.static(path.join(__dirname, '../frontend')));

// WebSocket-Server für SSH-Terminal
const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const ip = params.get('ip');
    const username = params.get('username');
    const password = params.get('password');

    if (!ip || !username || !password) {
        ws.send('Fehler: IP, Benutzername und Passwort sind erforderlich.');
        ws.close();
        return;
    }

    const conn = new Client();
    conn
        .on('ready', () => {
            ws.send('SSH-Verbindung erfolgreich hergestellt.');
            conn.shell((err, stream) => {
                if (err) {
                    ws.send(`Fehler beim Öffnen des Terminals: ${err.message}`);
                    ws.close();
                    return;
                }

                stream.on('data', (data) => ws.send(data.toString()));
                stream.on('close', () => ws.close());

                ws.on('message', (msg) => stream.write(msg));
            });
        })
        .on('error', (err) => {
            ws.send(`SSH-Verbindung fehlgeschlagen: ${err.message}`);
            ws.close();
        })
        .connect({
            host: ip,
            port: 22,
            username,
            password,
        });

    ws.on('close', () => conn.end());
});

// HTTP-Upgrade für WebSocket
app.server = app.listen(3000, () => {
    console.log(`Server läuft auf http://localhost:3000`);
});

app.server.on('upgrade', (request, socket, head) => {
    if (request.url.startsWith('/ssh')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Serververzeichnisse scannen und mit laufenden Screens verknüpfen
app.get('/api/scan-screens', (req, res) => {
    const serverRoot = path.join(__dirname, '../servers'); // Ordner mit Servern
    if (!fs.existsSync(serverRoot)) {
        fs.mkdirSync(serverRoot, { recursive: true }); // Erstelle den Ordner, falls er nicht existiert
    }

    exec('screen -ls', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: stderr.trim() });
        }

        const screens = stdout
            .split('\n')
            .filter(line => line.includes('\t'))
            .map(line => {
                const parts = line.trim().split('\t');
                return { name: parts[1].split('.')[0], full: parts[1] };
            });

        const detectedServers = fs.readdirSync(serverRoot).filter(dir => {
            const serverPath = path.join(serverRoot, dir);
            return fs.statSync(serverPath).isDirectory();
        });

        const result = detectedServers.map(server => {
            const screen = screens.find(s => s.name === server);
            return {
                name: server,
                path: path.join(serverRoot, server),
                screen: screen ? screen.full : null,
                running: !!screen,
            };
        });

        res.json({ servers: result });
    });
});

// Screen-Sitzungen verwalten
app.post('/api/screen', (req, res) => {
    const { action, name, command } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Screen-Name ist erforderlich.' });
    }

    let screenCommand;
    switch (action) {
        case 'start':
            if (!command) {
                return res.status(400).json({ error: 'Befehl ist erforderlich, um eine Sitzung zu starten.' });
            }
            screenCommand = `screen -dmS ${name} ${command}`;
            break;
        case 'stop':
            screenCommand = `screen -S ${name} -X quit`;
            break;
        case 'status':
            screenCommand = `screen -ls | grep ${name}`;
            break;
        default:
            return res.status(400).json({ error: 'Ungültige Aktion.' });
    }

    exec(screenCommand, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: stderr.trim() });
        }
        res.json({ message: stdout.trim() || 'Aktion erfolgreich.' });
    });
});

// Server starten/stoppen
app.post('/api/manage-server', (req, res) => {
    const { name, action } = req.body;

    if (!name || !action) {
        return res.status(400).json({ error: 'Name und Aktion sind erforderlich.' });
    }

    let command;
    switch (action) {
        case 'start':
            command = `screen -dmS ${name} ./start.sh`; // Beispiel: Start-Skript
            break;
        case 'stop':
            command = `screen -S ${name} -X quit`;
            break;
        default:
            return res.status(400).json({ error: 'Ungültige Aktion.' });
    }

    exec(command, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: stderr.trim() });
        }
        res.json({ message: stdout.trim() || 'Aktion erfolgreich.' });
    });
});

// Server hinzufügen
app.post('/api/add-server', (req, res) => {
    const { serverName, game, version, type } = req.body;

    if (!serverName || !game || !version || !type) {
        return res.status(400).json({ error: 'Alle Felder sind erforderlich.' });
    }

    const serverRoot = path.join(__dirname, '../servers');
    if (!fs.existsSync(serverRoot)) {
        fs.mkdirSync(serverRoot, { recursive: true }); // Erstelle den Ordner, falls er nicht existiert
    }

    const serverPath = path.join(serverRoot, serverName);
    if (fs.existsSync(serverPath)) {
        return res.status(400).json({ error: 'Ein Server mit diesem Namen existiert bereits.' });
    }

    fs.mkdirSync(serverPath); // Erstelle das Verzeichnis für den neuen Server
    const config = { game, version, type };
    fs.writeFileSync(path.join(serverPath, 'server-config.json'), JSON.stringify(config, null, 2));

    res.json({ message: 'Server erfolgreich hinzugefügt.', server: { name: serverName, game, version, type } });
});

app.post('/api/add-server', (req, res) => {
    const { serverName, game, version, type } = req.body;

    if (!serverName || !game || !version || !type) {
        return res.status(400).json({ error: 'Alle Felder sind erforderlich.' });
    }

    const newServer = { name: serverName, game, version, type };
    servers.push(newServer);

    res.json({ message: 'Server erfolgreich hinzugefügt.', server: newServer });
});

app.get('/api/servers', (req, res) => {
    res.json(servers);
});

app.post('/api/configure-server', (req, res) => {
    const { serverPath, ram, players } = req.body;

    if (!fs.existsSync(serverPath)) {
        return res.status(400).json({ error: 'Server-Pfad existiert nicht.' });
    }

    // Beispiel: Speichere die Konfiguration in einer Datei
    const config = { ram, players };
    fs.writeFileSync(`${serverPath}/server-config.json`, JSON.stringify(config, null, 2));

    res.json({ message: 'Konfiguration gespeichert.' });
});

// Verbindung mit SFTP und SSH herstellen
app.post('/api/connect', (req, res) => {
    const { ip, username, password } = req.body;

    if (!ip || !username || !password) {
        return res.status(400).json({ error: 'IP, Benutzername und Passwort sind erforderlich.' });
    }

    const conn = new Client();
    conn
        .on('ready', () => {
            res.json({ message: 'SSH-Verbindung erfolgreich hergestellt.' });
            conn.end();
        })
        .on('error', (err) => {
            res.status(500).json({ error: `Verbindung fehlgeschlagen: ${err.message}` });
        })
        .connect({
            host: ip,
            port: 22,
            username,
            password,
        });
});

// Route für die SSH-Seite bereitstellen
app.get('/connect', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/connect.html'));
});

// Fallback-Route für die index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});
