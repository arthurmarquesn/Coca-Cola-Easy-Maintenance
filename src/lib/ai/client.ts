import Groq from "groq-sdk";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
  throw new Error(
    "A variável de ambiente GROQ_API_KEY não foi definida.",
  );
}

/* =========================================================
   CLIENTE GROQ
========================================================= */

export const groq = new Groq({
  apiKey,
});

/* =========================================================
   MODELO

   Modelo atual de produção utilizado apenas como engine
   do protótipo. Futuramente podemos trocar por Azure,
   OpenAI, modelo local etc.
========================================================= */

export const AI_MODEL =
  "openai/gpt-oss-20b";