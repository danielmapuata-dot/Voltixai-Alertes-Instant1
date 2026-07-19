require('dotenv').config();
const express = require('express');
const https = require('https');

const ANYSPORT_API_KEY = process.env.ANYSPORT_API_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;
const etatMatchs = new Map();

function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'X-API-Key': ANYSPORT_API_KEY,
        'Content-Type': 'application/json'
      }
    };
    if (corps) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(corps));
    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', m => donnees += m);
      reponse.on('end', () => {
        try { resoudre(JSON.parse(donnees)); }
        catch (err) { rejeter(new Error(`Réponse illisible : ${err.message}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

async function publier(texte) {
  try {
    const url = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: texte });
    console.log(`✅ PUBLIÉ : ${texte.split('\n')[0]}`);
  } catch (err) {
    console.error("❌ Erreur :", err.response?.data?.error?.message || err.message);
  }
}

async function surveiller() {
  try {
    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    const matchs = Array.isArray(data) ? data : (data?.data || data?.matches || []);
    for (const match of matchs) {
      const id = match.id || `${match.home_team_name}-${match.away_team_name}`;
      const domicile = match.home_team_name || "Équipe A";
      const exterieur = match.away_team_name || "Équipe B";
      const scoreActuel = match.score || `${match.home_score || 0}-${match.away_score || 0}`;
      const scoreMiTemps = match.half_score || `${match.home_ht || 0}-${match.away_ht || 0}`;
      const statut = (match.status || "").toLowerCase();
      const minute = match.minute || match.elapsed || "??";
      const evenements = match.events || [];
      const ancien = etatMatchs.get(id) || { statut: "", buts: new Set() };

      if (statut === "halftime" && ancien.statut !== "halftime") {
        await publier(`⏸️ MI-TEMPS ! ⏳
${domicile} ${scoreMiTemps} ${exterieur}

#VoltixaiInfosport #MiTemps #ScoresLive`);
      }

      if ((statut === "finished" || statut === "ft") && ancien.statut !== "finished") {
        await publier(`🏁 TEMPS COMPLET ! ⏳
${domicile} ${scoreActuel} ${exterieur}
➡️ 1er mi-temps : ${scoreMiTemps} | 2e mi-temps : ${scoreActuel}

#VoltixaiInfosport #ResultatFinal #FootDuMonde`);
      }

      for (const evt of evenements) {
        if ((evt.type || "").toLowerCase() === "goal") {
          const idBut = `${id}-${evt.minute}-${evt.player || "inconnu"}`;
          if (!ancien.buts.has(idBut)) {
            ancien.buts.add(idBut);
            const joueur = evt.player || "Joueur inconnu";
            const equipe = evt.team_name || evt.team || domicile;
            await publier(`⚽ ${minute}' | GOOOOOAL 😍
⚽ ${joueur} pour ${equipe}
➡️ ${domicile} ${scoreActuel} ${exterieur}

#VoltixaiInfosport #ButEnDirect #ScoresLive`);
          }
        }
      }
      etatMatchs.set(id, { statut: statut, buts: ancien.buts });
    }
  } catch (err) {
    console.error("❌ Erreur surveillance :", err.message);
  }
}

app.get('/', (req, res) => res.send("⚽ Robot Alertes Instantanées - ACTIF"));
app.listen(PORT, () => {
  console.log("🚀 Démarré : vérification toutes les 30s");
  surveiller();
  setInterval(surveiller, 30000);
});
    
