require('dotenv').config();
const express = require('express');
const https = require('https');

// 🛡️ Variables d'environnement (à renseigner sur Render)
const ANYSPORT_API_KEY = process.env.ANYSPORT_API_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;
const etatMatchs = new Map(); // Évite les doublons

// 🔧 Appel API sécurisé
function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json'
      }
    };
    // Clé UNIQUEMENT pour AnySport
    if (urlObj.hostname.includes('anysport.io')) {
      options.headers['X-API-Key'] = ANYSPORT_API_KEY;
    }
    // Token UNIQUEMENT pour Facebook
    if (urlObj.hostname.includes('facebook.com')) {
      options.headers['Authorization'] = `Bearer ${FACEBOOK_TOKEN}`;
    }

    if (corps) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(corps));
    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', m => donnees += m);
      reponse.on('end', () => {
        try {
          const resultat = JSON.parse(donnees);
          if (reponse.statusCode >= 400) rejeter(new Error(`Erreur ${reponse.statusCode}: ${resultat.error?.message || 'Inconnu'}`));
          else resoudre(resultat);
        } catch (err) { rejeter(new Error(`Réponse illisible : ${err.message}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// 📤 Publication avec l'en-tête demandé
async function publierGroupeMatchs(groupe) {
  const message = `⚽ 🚩 VOLTIXAI LIVE SCORE ⚽ ${new Date().toLocaleTimeString('fr-FR', {timeZone:'GMT', hour:'2-digit', minute:'2-digit'})} - GMT

${groupe.contenu}

${groupe.hashtags}`;

  try {
    const url = `https://graph.facebook.com/v21.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: message });
    console.log(`✅ PUBLIÉ : ${groupe.titre}`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// 🔍 Surveillance et formatage des données
async function surveiller() {
  try {
    console.log("\n🔄 Vérification des matchs...");
    const reponse = await appelAPI("https://api.anysport.io/v1/livescore");
    const matchs = reponse.success ? reponse.data : [];
    console.log(`📊 ${matchs.length} match(s) trouvé(s)`);

    // Regroupe les matchs par championnat
    const parChampionnat = new Map();
    for (const match of matchs) {
      const championnat = match.league || "Matchs Amicaux";
      if (!parChampionnat.has(championnat)) parChampionnat.set(championnat, []);
      parChampionnat.get(championnat).push(match);
    }

    // Traite chaque groupe
    for (const [championnat, listeMatchs] of parChampionnat) {
      let contenu = `🏆 ${championnat}\n`;
      let hashtags = `#VoltixaiLiveScore #ResultatsFoot #EnDirect #Football`;

      for (const match of listeMatchs) {
        const id = match.match_id;
        const signature = `${match.score}-${match.status}-${match.minute}`;
        if (etatMatchs.get(id) === signature) continue; // Ignore si déjà publié
        etatMatchs.set(id, signature);

        // Affiche le temps de jeu
        const minute = match.minute ? `${match.minute}'` : 
                      match.status === "ht" ? "⏸️ Mi-temps" : 
                      match.status === "penalties" ? "🏆 Tirs au but" : 
                      match.status === "ft" ? "✅ Terminé" : "En cours";
        const score = match.score || "0-0";
        contenu += `● ${minute} | ${match.home} ${score} ${match.away}\n`;
      }

      // Publie le message complet
      await publierGroupeMatchs({
        titre: championnat,
        contenu: contenu.trim(),
        hashtags: hashtags
      });
    }
  } catch (err) {
    console.error("❌ Erreur surveillance :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Voltixai Live Score - ACTIF"));
app.listen(PORT, () => {
  console.log("🚀 Démarré : vérif TOUTES LES 3 MINUTES");
  surveiller();
  // ⏱️ Fréquence vérification : 3 minutes = 180000 ms
  setInterval(surveiller, 180000);

  // ⏱️ Anti-veille Render : aussi toutes les 3 minutes
  setInterval(() => { 
    https.get(`https://voltixai-infosport-4.onrender.com`);
  }, 180000);
});
