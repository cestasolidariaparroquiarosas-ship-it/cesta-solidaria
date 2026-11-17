import { config } from "dotenv";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { sumarDias } from "../../lib/fechas";
import { clienteServicio } from "../utilidades/supabase";
import { entrarComoAdmin } from "./utilidades";

// Iteración 0003: presentación (spec 0003, CA-0301 a CA-0306). Escriben datos: solo
// contra Supabase local. Las semanas son de entregas del siglo XXV para no cruzarse con
// las de otras pruebas.
test.skip(Boolean(process.env.BASE_URL), "Solo contra Supabase local");

config({ path: ".env.local", quiet: true });
const MARCA = `e2e-presentacion-${Date.now()}`;
const semanasCreadas: string[] = [];
const col: Record<string, string> = {};
const alimentos: Record<string, string> = {};
// Semanas de cada caso de P1, creadas en beforeAll.
const sem: Record<"sinCestas" | "conCestas" | "conReparto" | "enviada", string> = {
  sinCestas: "",
  conCestas: "",
  conReparto: "",
  enviada: "",
};
const tokens: Record<string, string> = {};
let lista = "";

function comprobar<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (error || data === null || data === undefined) throw new Error(`No se han podido preparar los datos: ${error?.message}`);
  return data;
}

const fechaLejana = () => sumarDias("2400-01-01", Math.floor(Math.random() * 50_000));

async function nuevaSemana() {
  const s = clienteServicio();
  const plazo = new Date(Date.now() + 3_600_000).toISOString();
  const semana = comprobar(
    await s
      .from("semanas")
      .insert({ fecha_entrega: fechaLejana(), precio_base: 20, plazo_confirmacion: plazo })
      .select("id")
      .single(),
  );
  semanasCreadas.push(semana.id);
  return { id: semana.id, plazo };
}

/** Cesta con 3 arroces y 3 aceites (25,20 €). Devuelve el id de cada línea. */
async function cestaCon(semana: string) {
  const s = clienteServicio();
  const cesta = comprobar(
    await s
      .from("cestas")
      .insert({ semana_id: semana, identificador_receptor: `${MARCA} Familia`, adultos: 2, ninos: 1 })
      .select("id")
      .single(),
  );
  const items = comprobar(
    await s
      .from("cesta_items")
      .insert([
        { cesta_id: cesta.id, alimento_id: alimentos.Arroz, cantidad: 3 },
        { cesta_id: cesta.id, alimento_id: alimentos.Aceite, cantidad: 3 },
      ])
      .select("id, alimento_id"),
  );
  return (a: string) => items.find((i) => i.alimento_id === alimentos[a])!.id;
}

test.beforeAll(async ({}, info) => {
  const s = clienteServicio();
  const sufijo = info.project.name;
  for (const f of comprobar(
    await s
      .from("alimentos")
      .insert([
        { nombre: `${MARCA}-${sufijo} Arroz`, unidad: "paquete 1 kg", precio_aprox: 1.2 },
        { nombre: `${MARCA}-${sufijo} Aceite`, unidad: "botella 1 l", precio_aprox: 7.5 },
      ])
      .select("id, nombre"),
  )) {
    alimentos[f.nombre.endsWith("Arroz") ? "Arroz" : "Aceite"] = f.id;
  }
  for (const nombre of ["Ana", "Bea", "Carla"]) {
    col[nombre] = comprobar(
      await s
        .from("colaboradores")
        .insert({ nombre: `${nombre} ${MARCA}`, email: `${MARCA}-${sufijo}-${nombre}@cesta.test`.toLowerCase() })
        .select("id")
        .single(),
    ).id;
  }

  // Una lista base, para comprobar el menú en su ficha (CA-0301).
  lista = comprobar(
    await s.from("listas_base").insert({ nombre: `${MARCA}-${sufijo} Lista` }).select("id").single(),
  ).id;

  // P1: sin cestas; con cestas y sin reparto; con reparto en preparación.
  sem.sinCestas = (await nuevaSemana()).id;
  sem.conCestas = (await nuevaSemana()).id;
  await cestaCon(sem.conCestas);
  sem.conReparto = (await nuevaSemana()).id;
  const linea = await cestaCon(sem.conReparto);
  const propuesta = comprobar(
    await s
      .from("asignaciones")
      .insert({ semana_id: sem.conReparto, colaborador_id: col.Ana })
      .select("id")
      .single(),
  );
  comprobar(
    await s
      .from("asignacion_items")
      .insert([
        { asignacion_id: propuesta.id, cesta_item_id: linea("Arroz"), cantidad: 3 },
        { asignacion_id: propuesta.id, cesta_item_id: linea("Aceite"), cantidad: 3 },
      ])
      .select(),
  );

  // Enviada: Ana confirmó (3 aceites, 22,50 €: supera el precio base), Bea espera
  // (3 arroces) y Carla no puede (sin alimentos: ya se los pasaron a otro).
  const enviada = await nuevaSemana();
  sem.enviada = enviada.id;
  const lineaEnviada = await cestaCon(sem.enviada);
  const ahora = new Date().toISOString();
  const asignaciones = comprobar(
    await s
      .from("asignaciones")
      .insert([
        { semana_id: sem.enviada, colaborador_id: col.Ana, estado: "confirmada", plazo: enviada.plazo, enviado_en: ahora, respondido_en: ahora },
        { semana_id: sem.enviada, colaborador_id: col.Bea, estado: "pendiente", plazo: enviada.plazo, enviado_en: ahora },
        { semana_id: sem.enviada, colaborador_id: col.Carla, estado: "rechazada", plazo: enviada.plazo, enviado_en: ahora, respondido_en: ahora },
      ])
      .select("id, colaborador_id, token"),
  );
  const de = (c: string) => asignaciones.find((a) => a.colaborador_id === col[c])!;
  for (const c of ["Ana", "Bea", "Carla"]) tokens[c] = de(c).token as string;
  comprobar(
    await s
      .from("asignacion_items")
      .insert([
        { asignacion_id: de("Ana").id, cesta_item_id: lineaEnviada("Aceite"), cantidad: 3 },
        { asignacion_id: de("Bea").id, cesta_item_id: lineaEnviada("Arroz"), cantidad: 3 },
      ])
      .select(),
  );
  comprobar(await s.from("semanas").update({ estado: "enviada" }).eq("id", sem.enviada).select());
});

test.afterAll(async () => {
  const s = clienteServicio();
  if (semanasCreadas.length) await s.from("semanas").delete().in("id", semanasCreadas);
  await s.from("colaboradores").delete().like("email", `${MARCA}%`);
  await s.from("alimentos").delete().like("nombre", `${MARCA}%`);
  await s.from("listas_base").delete().like("nombre", `${MARCA}%`);
});

async function sinDesbordar(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
}

const menu = (page: Page) => page.getByRole("navigation", { name: "Secciones" });
const pasos = (page: Page) => page.getByRole("list", { name: "Pasos de la semana" });

test("CA-0301: el menú marca la sección actual, también en sus subpáginas", async ({ page }) => {
  await entrarComoAdmin(page);
  const casos: [string, string][] = [
    ["/", "Inicio"],
    ["/semanas", "Semanas"],
    [`/semanas/${sem.enviada}`, "Semanas"],
    [`/semanas/${sem.enviada}/reparto`, "Semanas"],
    ["/historico", "Histórico"],
    ["/colaboradores", "Colaboradores"],
    ["/colaboradores/nuevo", "Colaboradores"],
    ["/alimentos", "Alimentos"],
    ["/alimentos/etiquetas", "Alimentos"],
    ["/listas", "Listas base"],
    [`/listas/${lista}`, "Listas base"],
  ];
  for (const [ruta, seccion] of casos) {
    await page.goto(ruta);
    const actual = menu(page).locator('[aria-current="page"]');
    await expect(actual, ruta).toHaveCount(1);
    await expect(actual, ruta).toHaveText(seccion);
  }
});

test("CA-0302: la barra de pasos marca los hechos y el actual según P1", async ({ page }) => {
  await entrarComoAdmin(page);
  const casos: [string, string, number][] = [
    [sem.sinCestas, "2. Cestas", 1],
    [sem.conCestas, "3. Reparto", 2],
    [sem.conReparto, "4. Envío y respuestas", 3],
    [sem.enviada, "4. Envío y respuestas", 3],
  ];
  for (const [id, actual, hechos] of casos) {
    await page.goto(`/semanas/${id}`);
    await expect(pasos(page).getByRole("link")).toHaveCount(4);
    await expect(pasos(page).locator('[aria-current="step"]')).toContainText(actual);
    await expect(pasos(page).getByRole("link", { name: /\(hecho\)/ })).toHaveCount(hechos);
  }
});

test("CA-0303: el seguimiento agrupa las respuestas según P2", async ({ page }) => {
  await entrarComoAdmin(page);
  await page.goto(`/semanas/${sem.enviada}`);
  const respuestas = page.getByRole("list", { name: "Respuestas" });
  await expect(respuestas.getByRole("heading", { level: 3 })).toHaveText([
    /Esperan respuesta · 1/,
    /Confirmadas · 1/,
    /No pueden o no respondieron · 1/,
  ]);
  // Cada colaborador sigue siendo un elemento de «Respuestas» (P3).
  await expect(respuestas.getByRole("listitem", { name: `Ana ${MARCA}` })).toContainText("Confirmada");
  await expect(respuestas.getByRole("listitem", { name: `Bea ${MARCA}` })).toContainText("Esperando respuesta");
  await expect(respuestas.getByRole("listitem", { name: `Carla ${MARCA}` })).toContainText("No puede");
  // Lo que lleva cada uno, en pastillas.
  await expect(respuestas.getByRole("list", { name: `Lo que lleva Bea ${MARCA}` }).getByRole("listitem")).toHaveText([
    /3 × .*Arroz/,
  ]);
});

test("CA-0306: cada tarjeta del reparto tiene su barra de gasto", async ({ page }) => {
  await entrarComoAdmin(page);
  await page.goto(`/semanas/${sem.enviada}/reparto`);
  const tarjeta = (nombre: string) => page.getByRole("listitem", { name: `${nombre} ${MARCA}`, exact: true });
  await expect(tarjeta("Ana").getByRole("img", { name: /^22,50\s€ de 20,00\s€$/ })).toBeVisible();
  await expect(tarjeta("Ana")).toContainText("supera el precio base (20,00");
  await expect(tarjeta("Bea").getByRole("img", { name: /^3,60\s€ de 20,00\s€$/ })).toBeVisible();
  await expect(tarjeta("Bea")).not.toContainText("supera el precio base");
});

test.describe("contraste", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, "Solo en escritorio: el color no cambia con el ancho");

  test("CA-0304: sin fallos de contraste en las pantallas principales", async ({ page }) => {
    // 14 pantallas con su análisis de axe: más que el tiempo por defecto.
    test.setTimeout(120_000);
    const revisar = async (ruta: string) => {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const { violations } = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
      const fallos = violations.flatMap((v) => v.nodes.map((n) => `${ruta}: ${n.target.join(" ")} — ${n.failureSummary}`));
      expect(fallos, ruta).toEqual([]);
    };

    // Sin sesión: acceso y páginas de los enlaces del correo.
    await revisar("/login");
    await revisar(`/r/${tokens.Bea}?respuesta=si`);
    await revisar(`/baja/${tokens.Bea}`);

    await entrarComoAdmin(page);
    for (const ruta of [
      "/",
      "/semanas",
      `/semanas/${sem.conReparto}`,
      `/semanas/${sem.conReparto}/reparto`,
      `/semanas/${sem.enviada}`,
      `/semanas/${sem.enviada}/reparto`,
      "/colaboradores",
      "/alimentos",
      "/listas",
      "/historico",
    ]) {
      await revisar(ruta);
    }
  });
});

test.describe("cabecera en el móvil", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, "Solo en el móvil");

  test("CA-0305: cabecera baja, todas las secciones alcanzables y sin desbordar", async ({ page }) => {
    await entrarComoAdmin(page);
    for (const ruta of ["/", "/alimentos", "/listas", `/semanas/${sem.enviada}`, `/semanas/${sem.enviada}/reparto`]) {
      await page.goto(ruta);
      const alto = (await page.locator("header").boundingBox())!.height;
      expect(alto, ruta).toBeLessThanOrEqual(130);
      await sinDesbordar(page);
    }
    // La última sección se alcanza deslizando la fila del menú.
    await page.goto("/");
    const ultima = menu(page).getByRole("link", { name: "Listas base" });
    await ultima.scrollIntoViewIfNeeded();
    await expect(ultima).toBeInViewport();
    await sinDesbordar(page);
    await ultima.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Listas base");
  });
});
