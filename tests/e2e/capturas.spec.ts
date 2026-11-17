import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { clienteServicio } from "../utilidades/supabase";
import { entrarComoAdmin } from "./utilidades";

// Capturas de las pantallas principales con los datos de prueba (plan 0003, paso 6).
// No comprueban nada: CI las guarda como artefacto del PR para revisar el aspecto antes
// de fusionar. Solo se ejecutan con CAPTURAS=1, después de cargar los datos de prueba.
test.skip(!process.env.CAPTURAS || Boolean(process.env.BASE_URL), "Solo en CI, con los datos de prueba cargados");

config({ path: ".env.local", quiet: true });

test("capturas @capturas", async ({ page }, info) => {
  const s = clienteServicio();
  const { data: semanas } = await s.from("semanas").select("id, estado, fecha_entrega").order("fecha_entrega");
  const enviada = semanas!.find((x) => x.estado === "enviada")!;
  const borrador = semanas!.find((x) => x.estado === "borrador")!;
  const { data: pendiente } = await s
    .from("asignaciones")
    .select("token")
    .eq("semana_id", enviada.id)
    .eq("estado", "pendiente")
    .limit(1)
    .single();

  let n = 0;
  const capturar = async (nombre: string) => {
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    n += 1;
    // JPEG: pesan poco, y CI también las vuelca en el registro (ver ci.yml).
    await page.screenshot({
      path: `capturas/${info.project.name}/${String(n).padStart(2, "0")}-${nombre}.jpg`,
      fullPage: true,
      type: "jpeg",
      quality: 70,
    });
  };

  await page.goto("/login");
  await capturar("acceso");
  await page.goto(`/r/${pendiente!.token}?respuesta=si`);
  await capturar("respuesta");

  await entrarComoAdmin(page);
  const pantallas: [string, string][] = [
    ["/", "inicio"],
    ["/semanas", "semanas"],
    [`/semanas/${enviada.id}`, "semana-enviada"],
    [`/semanas/${enviada.id}/reparto`, "reparto-enviada"],
    [`/semanas/${borrador.id}`, "semana-en-preparacion"],
    [`/semanas/${borrador.id}/reparto`, "reparto-en-preparacion"],
    ["/colaboradores", "colaboradores"],
    ["/alimentos", "alimentos"],
    ["/listas", "listas"],
    ["/historico", "historico"],
  ];
  for (const [ruta, nombre] of pantallas) {
    await page.goto(ruta);
    await capturar(nombre);
  }
});
