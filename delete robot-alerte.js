require('dotenv').config();
const express = require('express');
const https = require('https');

// --------------------------
// CONFIGURATION
// --------------------------
const ANYSPORT_API_KEY = process.env.ANYSPORT_API_KEY || '';
const FACEBOOK_TOKEN = process.env.FACEBOOK_TOKEN || '';
const FACEBOOK_PAGE_ID = process.env.FACEBOOK_PAGE_ID || '';

const app = express();
const PORT = process.env.PORT || 3001;
const etatMatchs = new Map();

// --------------------------
// APPEL API SÉCURISÉ
// --------------------------
function appelAPI(url, method = 'GET', corps = null) {
  return new Promise((resoudre, rejeter) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method.toUpperCase(),
      headers: {
        'X-API-Key': ANYSPORT_API_KEY,
        'Authorization': `Bearer ${FACEBOOK_TOKEN}`, // Ajout pour Graph API
        'Content-Type': 'application/json'
      }
    };
    if (corps) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(corps));

    const requete = https.request(options, (reponse) => {
      let donnees = '';
      reponse.on('data', m => donnees += m);
      reponse.on('end', () => {
        try {
          const resultat = JSON.parse(donnees);
          if (reponse.statusCode >= 400) rejeter(new Error(`Erreur API ${reponse.statusCode}: ${resultat.error?.message || 'Inconnu'}`));
          else resoudre(resultat);
        } catch (err) { rejeter(new Error(`Réponse illisible : ${err.message}`)); }
      });
    });
    requete.on('error', rejeter);
    if (corps) requete.write(JSON.stringify(corps));
    requete.end();
  });
}

// --------------------------
// PUBLICATION FORMAT SCOREZONE
// --------------------------
async function publier(texte) {
  try {
    const url = `https://graph.facebook.com/v25.0/${FACEBOOK_PAGE_ID}/feed`;
    await appelAPI(url, "POST", { message: texte });
    console.log(`✅ PUBLIÉ : ${texte.split('\n')[0]}`);
  } catch (err) {
    console.error("❌ Erreur publication :", err.message);
  }
}

// --------------------------
// SURVEILLANCE EN TEMPS RÉEL AMÉLIORÉE
// --------------------------
async function surveiller() {
  try {
    console.log("\n🔄 Vérification des matchs...");
    const data = await appelAPI("https://api.anysport.io/v1/livescore");
    const matchs = Array.isArray(data) ? data : (data?.data || data?.matches || []);
    console.log(`📊 ${matchs.length} match(s) récupéré(s)`);

    for (const match of matchs) {
      const id = match.id || `${match.home_team_name}-${match.away_team_name}`;
      const domicile = match.home_team_name || "Équipe A";
      const exterieur = match.away_team_name || "Équipe B";
      const scoreActuel = match.score || `${match.home_score || 0}-${match.away_score || 0}`;
      const scoreMiTemps = match.half_score || `${match.home_ht || 0}-${match.away_ht || 0}`;
      const statut = (match.status || match.event_status || "").toLowerCase();
      const minute = match.minute || match.elapsed || "??";
      const evenements = match.events || [];
      const ancien = etatMatchs.get(id) || { statut: "", buts: new Set() };

      // 🟡 MI-TEMPS
      if ((statut === "halftime" || statut === "ht") && ancien.statut !== "halftime") {
        await publier(`⏸️ MI-TEMPS ! ⏳
${domicile} ${scoreMiTemps} ${exterieur}

#VoltixaiInfosport #MiTemps #ScoresLive`);
      }

      // 🔴 FIN DE MATCH
      if ((statut === "finished" || statut === "ft" || statut === "terminé") && ancien.statut !== "finished") {
        await publier(`🏁 TEMPS COMPLET ! ⏳
${domicile} ${scoreActuel} ${exterieur}
➡️ 1er mi-temps : ${scoreMiTemps} | 2e mi-temps : ${scoreActuel}

#VoltixaiInfosport #ResultatFinal #FootDuMonde`);
      }

      // ⚽ DÉTECTION TOUS LES TYPES DE BUTS
      for (const evt of evenements) {
        const typeEvt = (evt.type || "").toLowerCase();
        if (["goal", "but", "score", "penalty", "own-goal", "but contre son camp"].includes(typeEvt)) {
          const minEvt = evt.minute || minute;
          const idBut = `${id}-${minEvt}-${evt.player || "inconnu"}`;
          if (!ancien.buts.has(idBut)) {
            ancien
