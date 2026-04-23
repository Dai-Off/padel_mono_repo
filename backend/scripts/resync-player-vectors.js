const fs = require("fs");
const https = require("https");
const path = require("path");

function readEnv(filePath) {
  const out = {};
  const txt = fs.readFileSync(filePath, "utf8");
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
      })
      .on("error", reject);
  });
}

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.error("No existe backend/.env");
    process.exit(1);
  }

  const env = readEnv(envPath);
  const url = (env.SUPABASE_URL || "").trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !key) {
    console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend/.env");
    process.exit(1);
  }

  const list = await get(url + "/rest/v1/players?select=id", {
    apikey: key,
    Authorization: "Bearer " + key,
  });

  if (list.status < 200 || list.status >= 300) {
    console.error("Error listando players:", list.status, list.body);
    process.exit(1);
  }

  const players = JSON.parse(list.body);
  let ok = 0;
  let fail = 0;

  for (const p of players) {
    const r = await post(
      url + "/functions/v1/sync-player-vector",
      {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: "Bearer " + key,
      },
      JSON.stringify({ player_id: p.id })
    );

    if (r.status >= 200 && r.status < 300) {
      ok += 1;
      console.log("OK", p.id);
    } else {
      fail += 1;
      console.log("FAIL", p.id, r.status, r.body);
    }
  }

  console.log("DONE ok=" + ok + " fail=" + fail + " total=" + players.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
