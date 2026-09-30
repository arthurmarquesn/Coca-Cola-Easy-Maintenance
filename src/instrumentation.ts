export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { queryRows } = await import("@/lib/db");

  try {
    await queryRows("SELECT 1");

    console.log("✅ Banco de dados conectado com sucesso.");
  } catch (error) {
    console.error("❌ Falha ao conectar ao banco de dados.");
    console.error(error);
  }
}
