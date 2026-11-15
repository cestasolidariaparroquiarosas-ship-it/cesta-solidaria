import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { formatearFecha, sumarDias } from "../../lib/fechas";
import { clienteServicio } from "../utilidades/supabase";
import { entrarComoAdmin } from "./utilidades";

// Entregado, cierre e histórico (plan PR 8; CA-28, CA-29). Escriben datos: solo contra
// Supabase local. Las semanas son de entregas pasadas (año 1700 y pico) para no
// cruzarse con las de otras pruebas ni con la semana en curso de Inicio.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e-historico-${Date.now()}`;
const semanas: string[] = [];
const col: Record<string, string> = {};
let arroz: string;

function comprobar<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error || data === null || data === undefined) throw new Error(`No se han podido preparar los datos: ${error?.message}`);
  return data;
}

test.beforeAll(async ({}, info) => {
  const s = clienteServicio();
  arroz = comprobar(
    await s
      .from("alimentos")
      .insert({ nombre: `${MARCA}-${info.project.name} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 })
      .select("id")
      .single(),
  ).id;
  for (const nombre of ["Ana", "Bea"]) {
    col[nombre] = comprobar(
      await s
        .from("colaboradores")
        .insert({
          nombre: `${nombre} ${MARCA}`,
          email: `${MARCA}-${info.project.name}-${nombre}@cesta.test`.toLowerCase(),
        })
        .select("id")
        .single(),
    ).id;
  }
});

test.afterAll(async () => {
  const s = clienteServicio();
  if (semanas.length) await s.from("semanas").delete().in("id", semanas);
  await s.from("colaboradores").delete().like("email", `${MARCA}%`);
  await s.from("alimentos").delete().like("nombre", `${MARCA}%`);
});

/** Semana de una entrega pasada, enviada: Ana confirmó (2 arroces) y Bea no pudo. */
async function semanaPasada() {
  const s = clienteServicio();
  const fecha = sumarDias("1700-01-01", Math.floor(Math.random() * 50_000));
  const semana = comprobar(
    await s
      .from("semanas")
      .insert({ fecha_entrega: fecha, precio_base: 20, plazo_confirmacion: new Date().toISOString() })
      .select("id")
      .single(),
  );
  semanas.push(semana.id);
  const cesta = comprobar(
    await s
      .from("cestas")
      .insert({ semana_id: semana.id, identificador_receptor: `${MARCA} Familia`, adultos: 1, ninos: 0 })
      .select("id")
      .single(),
  );
  const item = comprobar(
    await s.from("cesta_items").insert({ cesta_id: cesta.id, alimento_id: arroz, cantidad: 2 }).select("id").single(),
  );
  const ahora = new Date().toISOString();
  const asignaciones = comprobar(
    await s
      .from("asignaciones")
      .insert([
        { semana_id: semana.id, colaborador_id: col.Ana, estado: "confirmada", plazo: ahora, respondido_en: ahora, enviado_en: ahora },
        { semana_id: semana.id, colaborador_id: col.Bea, estado: "rechazada", plazo: ahora, respondido_en: ahora, enviado_en: ahora },
      ])
      .select("id, colaborador_id"),
  );
  const ana = asignaciones.find((a) => a.colaborador_id === col.Ana)!;
  comprobar(await s.from("asignacion_items").insert({ asignacion_id: ana.id, cesta_item_id: item.id, cantidad: 2 }).select());
  comprobar(await s.from("semanas").update({ estado: "enviada" }).eq("id", semana.id).select());
  return { id: semana.id, fecha };
}

async function sinDesbordar(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
}

test.describe("histórico en escritorio", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio");

  test("CA-29: marcar entregado, cerrar la semana y verla en el histórico con quién llevó qué", async ({ page }) => {
    const { id, fecha } = await semanaPasada();
    await entrarComoAdmin(page);
    await page.goto(`/semanas/${id}`);

    const respuestas = page.getByRole("list", { name: "Respuestas" });
    const ana = respuestas.getByRole("listitem", { name: `Ana ${MARCA}` });
    await ana.getByRole("button", { name: `Marcar como entregado: Ana ${MARCA}` }).click();
    await expect(page.getByRole("status")).toHaveText("Marcado como entregado.");
    await expect(ana).toContainText("Entregado");

    // Cerrar pide confirmación.
    await page.getByRole("button", { name: "Cerrar la semana" }).click();
    await expect(page.getByText("Marca la casilla para confirmar.")).toBeVisible();
    await page.getByLabel(/Quiero cerrar la semana/).check();
    await page.getByRole("button", { name: "Cerrar la semana" }).click();
    await expect(page.getByRole("status")).toHaveText("Semana cerrada: ya está en el histórico.");
    await expect(page.getByRole("button", { name: "Cerrar la semana" })).toHaveCount(0);

    await page.getByRole("link", { name: "Histórico" }).click();
    const fila = page.getByRole("list", { name: "Semanas cerradas" }).getByRole("link", { name: new RegExp(`Entrega del ${formatearFecha(fecha)}`) });
    await expect(fila).toContainText("1 confirmada · 1 entregada · 1 no pudo");
    await fila.click();

    // Cada colaborador con sus alimentos y su estado final.
    await expect(ana).toContainText("Confirmada");
    await expect(ana).toContainText(`2 × ${MARCA}-escritorio Arroz`);
    await expect(ana).toContainText("Entregado");
    await expect(respuestas.getByRole("listitem", { name: `Bea ${MARCA}` })).toContainText("No puede");
  });
});

test.describe("inicio e histórico en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-28: Inicio, Histórico y una semana cerrada no desbordan a 375 px", async ({ page }) => {
    const { id } = await semanaPasada();
    await clienteServicio().rpc("cerrar_semana", { p_semana_id: id });
    await entrarComoAdmin(page);
    for (const ruta of ["/", "/historico", `/semanas/${id}`]) {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await sinDesbordar(page);
    }
  });
});

test("Inicio muestra la semana en curso o el botón para crear una", async ({ page }) => {
  await entrarComoAdmin(page);
  await page.goto("/");
  const seccion = page.getByRole("region", { name: "Semana en curso" });
  await expect(seccion).toBeVisible();
  await expect(
    seccion.getByRole("link", { name: "Ir a la semana" }).or(seccion.getByRole("link", { name: "Nueva semana" })),
  ).toBeVisible();
});
