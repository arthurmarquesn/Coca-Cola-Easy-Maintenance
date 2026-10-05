import Groq from "groq-sdk";

let client: Groq | undefined;

// A integração é opcional: valide a chave somente quando for utilizada.
export function getGroqClient(): Groq {
  if (client) return client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("A variável de ambiente GROQ_API_KEY não foi definida.");
  }
  client = new Groq({ apiKey });
  return client;
}

export const AI_MODEL = "openai/gpt-oss-20b";
