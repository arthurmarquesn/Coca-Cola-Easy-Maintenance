// Sobe o serviço de ML (FastAPI) junto com o Next.js: `npm run dev`.
// Use `npm run dev:next` para subir apenas o Next.js.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

function readEnv() {
  const env = {};

  for (const file of [".env", ".env.local"]) {
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);

      if (match) {
        env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }

  return env;
}

function isPortInUse(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => resolve(false));
  });
}

const env = { ...readEnv(), ...process.env };
const mlUrl = new URL(env.ML_SERVICE_URL || "http://127.0.0.1:8001");
const mlPort = Number(mlUrl.port || 8001);
const mlHost = mlUrl.hostname;
const children = [];

function run(label, command, args) {
  const child = spawn(command, args, { stdio: "inherit", shell: false });

  child.on("error", (error) => {
    console.error(`[${label}] não foi possível iniciar: ${error.message}`);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

if (await isPortInUse(mlPort, mlHost)) {
  console.log(`[ml] já está rodando em ${mlHost}:${mlPort}, reaproveitando.`);
} else {
  const python = env.PYTHON || (process.platform === "win32" ? "python" : "python3");

  console.log(`[ml] iniciando em ${mlHost}:${mlPort}...`);

  const ml = run("ml", python, [
    "-m", "uvicorn", "ml.api.app:app",
    "--host", mlHost,
    "--port", String(mlPort),
  ]);

  ml.on("exit", (code) => {
    if (code) {
      console.error(
        `[ml] encerrou com código ${code}. O Next.js segue rodando sem o modelo. ` +
        "Instale as dependências: pip install -r ml/requirements.txt",
      );
    }
  });
}

const nextBin = "node_modules/next/dist/bin/next";
const next = run("next", process.execPath, [nextBin, "dev"]);

next.on("exit", (code) => shutdown(code ?? 0));
