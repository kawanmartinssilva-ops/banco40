const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Conexão com o Banco de Dados de Alta Performance (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://usuario:senha@localhost:5432/bankcorp'
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Gerenciador de conexões em tempo real (Escalabilidade)
let conexoesAtivas = 0;

wss.on('connection', (ws) => {
    conexoesAtivas++;
    broadcastMetrics();

    ws.on('close', () => {
        conexoesAtivas--;
        broadcastMetrics();
    });
});

function broadcastMetrics() {
    const payload = JSON.stringify({ type: 'METRICS_UPDATE', conexoesAtivas });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// REST API: Registrar Transferência (Nacional ou Internacional)
app.post('/api/transferencias', async (req, res) => {
    const { remetenteId, destinatarioIdentificador, valor, tipo, moedaOrigem, moedaDestino } = req.body;
    try {
        const query = `
            INSERT INTO transferencias (remetente_id, destinatario_identificador, valor, tipo, moeda_origem, moeda_destino, data_hora)
            VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *
        `;
        const result = await pool.query(query, [remetenteId, destinatarioIdentificador, valor, tipo, moedaOrigem, moedaDestino]);
        
        // Notifica o criador/IA em tempo real sobre a nova transferência
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'NOVA_TRANSFERENCIA', dados: result.rows[0] }));
            }
        });

        res.status(201).json({ status: 'Sucesso', transferencia: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao processar transferência de alta performance' });
    }
});

// REST API EXCLUSIVA DO CRIADOR: Auditar Transferências Globais (Sem exibir saldos)
app.get('/api/admin/auditoria-global', async (req, res) => {
    const { chaveCriador } = req.headers;
    
    // Autenticação de Poder Supremo do Criador
    if (chaveCriador !== 'MASTER_CREATOR_KEY_999') {
        return res.status(403).json({ error: 'Acesso negado. Apenas o Criador possui estes poderes.' });
    }

    try {
        const query = `
            SELECT 
                t.id,
                t.remetente_id,
                t.destinatario_identificador,
                t.valor,
                t.tipo,
                t.moeda_origem,
                t.moeda_destino,
                t.data_hora
            FROM transferencias t
            ORDER BY t.data_hora DESC
            LIMIT 500
        `;
        const result = await pool.query(query);
        res.json({
            conexoesAtivas,
            totalAuditado: result.rowCount,
            transferencias: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar relatório de auditoria' });
    }
});

server.listen(3000, () => {
    console.log('🚀 Servidor BankCorp Enterprise rodando na porta 3000');
});