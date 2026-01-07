
// LEADERBOARD LOGIC
// Sostituisci con i tuoi dati reali
const SUPABASE_URL = 'https://xgfdlyymbvpdnmomcxhd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZmRseXltYnZwZG5tb21jeGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMDIzOTgsImV4cCI6MjA3ODc3ODM5OH0.LJB7E--yAm5Nyxti749HVbxskjbURpKGuqK2c2hRBQs';

// Inizializza client (usando la CDN globale)
// Assicurati che <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> sia in index.html prima di questo file
let supabaseClient = null;

try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase initialized");
    } else {
        console.error("Supabase SDK not found!");
    }
} catch (e) {
    console.error("Error initializing Supabase:", e);
}

// Riferimenti UI
const leaderboardScreen = document.getElementById('leaderboard-screen');
const leaderboardList = document.getElementById('leaderboard-list');
const openLeaderboardBtn = document.getElementById('open-leaderboard-btn');
const closeLeaderboardBtn = document.getElementById('close-leaderboard-btn');
const saveScoreBtn = document.getElementById('save-score-btn');
const playerNameInput = document.getElementById('player-name-input');
const saveScoreContainer = document.getElementById('save-score-container');

// Event Listeners
if (openLeaderboardBtn) {
    openLeaderboardBtn.addEventListener('click', () => {
        showLeaderboard();
        fetchLeaderboard();
    });
}

if (closeLeaderboardBtn) {
    closeLeaderboardBtn.addEventListener('click', hideLeaderboard);
}

if (saveScoreBtn) {
    saveScoreBtn.addEventListener('click', submitScore);
}

// Mostra/Nascondi
function showLeaderboard() {
    leaderboardScreen.classList.add('active');
    leaderboardScreen.classList.remove('hidden');
}

function hideLeaderboard() {
    leaderboardScreen.classList.remove('active');
    setTimeout(() => leaderboardScreen.classList.add('hidden'), 400); // Wait for transition
}

// Mostra input salvataggio (chiamato da game.js su GameOver)
function showSaveScoreUI(score) {
    saveScoreContainer.classList.remove('hidden');
    // Pre-fill se salvato localmente
    const savedName = localStorage.getItem('dunk_player_name');
    if (savedName) playerNameInput.value = savedName;
}

// Fetch Dati
async function fetchLeaderboard() {
    if (!supabaseClient) return;

    leaderboardList.innerHTML = '<div class="loading-spinner">Caricamento...</div>';

    const { data, error } = await supabaseClient
        .from('dunk_master_scores')
        .select('*')
        .order('score', { ascending: false })
        .limit(20);

    if (error) {
        console.error("Error fetching leaderboard:", error);
        leaderboardList.innerHTML = '<div class="error-msg">Errore caricamento classifica</div>';
        return;
    }

    renderLeaderboard(data);
}

// Render
function renderLeaderboard(scores) {
    leaderboardList.innerHTML = '';

    if (!scores || scores.length === 0) {
        leaderboardList.innerHTML = '<div class="empty-msg">Nessun punteggio ancora!</div>';
        return;
    }

    scores.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';

        let rankClass = 'rank-other';
        if (index === 0) rankClass = 'rank-1';
        else if (index === 1) rankClass = 'rank-2';
        else if (index === 2) rankClass = 'rank-3';

        // Data formatter
        const date = new Date(entry.created_at).toLocaleDateString();

        item.innerHTML = `
            <div class="lb-rank ${rankClass}">${index + 1}</div>
            <div class="lb-name">${escapeHtml(entry.username)}</div>
            <div class="lb-score">${entry.score}</div>
        `;
        leaderboardList.appendChild(item);
    });
}

// Salva Punteggio
async function submitScore() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert("Inserisci un nome!");
        return;
    }

    // Validazione base
    if (name.length > 15) {
        alert("Nome troppo lungo (max 15 caratteri)");
        return;
    }

    // Salva nome per la prossima volta
    localStorage.setItem('dunk_player_name', name);

    // Recupera score finale (dalla variabile globale o DOM)
    // Assumiamo che 'score' sia accessibile globalmente o passato. 
    // Per sicurezza leggiamo dal DOM del game over se disponibile
    const currentScore = parseInt(document.getElementById('final-score').innerText) || 0;

    saveScoreBtn.disabled = true;
    saveScoreBtn.innerText = "Salvataggio...";

    if (!supabaseClient) {
        alert("Errore configurazione Database");
        saveScoreBtn.disabled = false;
        return;
    }

    const { error } = await supabaseClient
        .from('dunk_master_scores')
        .insert([
            { username: name, score: currentScore }
        ]);

    if (error) {
        console.error("Error saving score:", error);
        alert("Errore nel salvataggio!");
        saveScoreBtn.disabled = false;
        saveScoreBtn.innerText = "SALVA";
    } else {
        // Successo
        saveScoreContainer.classList.add('hidden');
        alert("Punteggio salvato!");
        showLeaderboard();
        fetchLeaderboard();
    }
}

// Utility
function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Espone funzione globale per il game over
window.initLeaderboardSave = showSaveScoreUI;
