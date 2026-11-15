// Datos de prueba (iteración 0002, spec §2). Todo inventado: ningún dato real.
// Del Excel de los administradores solo se ha tomado la estructura: los productos de su
// "cesta tipo", sus cantidades por tramo de familia y los casos especiales.

import type { CantidadesPorTramo } from "./ajuste";

/** Error previsto: se muestra tal cual, porque no lleva datos personales. */
export class ErrorDatosDePrueba extends Error {}

export const LISTA_BASE = "Cesta tipo (aproximada)";
export const PRECIO_BASE = 20;
/** Hora del plazo de respuesta de cada semana, en Madrid. */
export const HORA_PLAZO = "20:00";

export type Producto = {
  clave: string;
  nombre: string;
  unidad: string;
  /** Precio aproximado de marca blanca: el Excel no tiene precios. */
  precio: number;
  /**
   * Códigos de las etiquetas de exclusión de la migración inicial. Son orientativas: los
   * embutidos de marca blanca suelen llevar proteína de leche, y el cacao soluble, cereal
   * malteado. Con productos reales hay que mirar la etiqueta de cada uno.
   */
  etiquetas: string[];
  /** Cantidades del Excel por tramo; null si no va en la lista base (se añade a mano). */
  tramos: CantidadesPorTramo | null;
};

export const PRODUCTOS: Producto[] = [
  { clave: "leche", nombre: "Leche entera", unidad: "caja de 6 briks de 1 l", precio: 5.7, etiquetas: ["lactosa"], tramos: [2, 2, 3, 4, 4] },
  { clave: "margarina", nombre: "Margarina", unidad: "tarrina 250 g", precio: 1.35, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "mermelada", nombre: "Mermelada", unidad: "tarro 350 g", precio: 1.45, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "pan_molde", nombre: "Pan de molde", unidad: "paquete", precio: 1.25, etiquetas: ["gluten"], tramos: [2, 1, 2, 2, 2] },
  { clave: "yogures", nombre: "Yogures de frutas", unidad: "16 unidades", precio: 3.6, etiquetas: ["lactosa"], tramos: [1, 1, 2, 2, 2] },
  { clave: "cafe", nombre: "Café molido", unidad: "paquete 250 g", precio: 2.6, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "galletas", nombre: "Galletas", unidad: "paquete 800 g", precio: 1.6, etiquetas: ["gluten"], tramos: [1, 2, 3, 4, 4] },
  { clave: "cereales", nombre: "Cereales", unidad: "caja 500 g", precio: 1.75, etiquetas: ["gluten"], tramos: [0, 2, 2, 2, 2] },
  { clave: "cacao", nombre: "Cacao soluble", unidad: "bote 400 g", precio: 2.4, etiquetas: ["gluten"], tramos: [0, 1, 1, 1, 1] },
  { clave: "azucar", nombre: "Azúcar", unidad: "paquete 1 kg", precio: 1.15, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "harina", nombre: "Harina de trigo", unidad: "paquete 1 kg", precio: 0.85, etiquetas: ["gluten"], tramos: [1, 1, 1, 1, 1] },
  { clave: "aceite_oliva", nombre: "Aceite de oliva", unidad: "botella 1 l", precio: 6.95, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "aceite_girasol", nombre: "Aceite de girasol", unidad: "botella 1 l", precio: 1.85, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "zanahorias", nombre: "Zanahorias", unidad: "bolsa 1 kg", precio: 1.05, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "cebollas", nombre: "Cebollas", unidad: "malla 1 kg", precio: 1.35, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "tomate_natural", nombre: "Tomate natural triturado", unidad: "2 botes de 500 g", precio: 1.7, etiquetas: [], tramos: [1, 1, 2, 2, 2] },
  { clave: "tomate_frito", nombre: "Tomate frito", unidad: "2 botes de 500 g", precio: 1.9, etiquetas: [], tramos: [1, 1, 2, 2, 2] },
  { clave: "verduras", nombre: "Verduras en conserva", unidad: "bote 400 g", precio: 1.1, etiquetas: [], tramos: [3, 4, 5, 7, 7] },
  { clave: "garbanzos", nombre: "Garbanzos", unidad: "paquete 1 kg", precio: 1.95, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "judias", nombre: "Judías blancas o pintas", unidad: "paquete 1 kg", precio: 2.2, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "lentejas", nombre: "Lentejas", unidad: "paquete 1 kg", precio: 1.85, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "fideos", nombre: "Fideos", unidad: "paquete 1 kg", precio: 1.3, etiquetas: ["gluten"], tramos: [1, 1, 1, 1, 1] },
  { clave: "macarrones", nombre: "Macarrones", unidad: "paquete 1 kg", precio: 1.3, etiquetas: ["gluten"], tramos: [1, 2, 2, 2, 2] },
  { clave: "arroz", nombre: "Arroz", unidad: "paquete 1 kg", precio: 1.45, etiquetas: [], tramos: [1, 2, 2, 2, 2] },
  { clave: "fuet", nombre: "Fuet", unidad: "unidad", precio: 2.2, etiquetas: ["cerdo", "lactosa"], tramos: [1, 1, 2, 2, 2] },
  { clave: "jamon_cocido", nombre: "Jamón cocido", unidad: "barra", precio: 2.8, etiquetas: ["cerdo", "lactosa"], tramos: [1, 1, 1, 1, 1] },
  { clave: "queso_lonchas", nombre: "Queso en lonchas", unidad: "paquete", precio: 1.95, etiquetas: ["lactosa"], tramos: [1, 2, 2, 3, 3] },
  { clave: "atun", nombre: "Atún en aceite", unidad: "pack de 3 latas", precio: 3.4, etiquetas: [], tramos: [2, 2, 2, 3, 3] },
  { clave: "sardinas", nombre: "Sardinas en aceite", unidad: "pack de 2 latas", precio: 2.1, etiquetas: [], tramos: [2, 2, 2, 2, 3] },
  { clave: "fruta", nombre: "Fruta del tiempo", unidad: "kg", precio: 1.9, etiquetas: [], tramos: [2, 2, 2, 2, 3] },
  { clave: "fruta_conserva", nombre: "Fruta en almíbar", unidad: "bote", precio: 1.6, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "patatas", nombre: "Patatas", unidad: "bolsa 3 kg", precio: 3.2, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "lavavajillas", nombre: "Lavavajillas a mano", unidad: "botella", precio: 1.2, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "multiusos", nombre: "Limpiador multiusos", unidad: "botella", precio: 1.35, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "gel", nombre: "Gel de ducha", unidad: "bote", precio: 1.4, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "champu", nombre: "Champú", unidad: "bote", precio: 1.45, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "papel_higienico", nombre: "Papel higiénico", unidad: "paquete de 12 rollos", precio: 3.6, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "dentifrico", nombre: "Dentífrico", unidad: "tubo", precio: 1.15, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  { clave: "sal", nombre: "Sal", unidad: "paquete 1 kg", precio: 0.45, etiquetas: [], tramos: [1, 1, 1, 1, 1] },
  // Casos especiales del Excel: se añaden a mano a la cesta que los necesita.
  { clave: "leche_sin_lactosa", nombre: "Leche sin lactosa", unidad: "caja de 6 briks de 1 l", precio: 6.9, etiquetas: [], tramos: null },
  { clave: "panales", nombre: "Pañales", unidad: "paquete", precio: 8.5, etiquetas: [], tramos: null },
  { clave: "leche_continuacion", nombre: "Leche de continuación", unidad: "bote 800 g", precio: 9.8, etiquetas: ["lactosa"], tramos: null },
  { clave: "pavo", nombre: "Pechuga de pavo", unidad: "barra", precio: 2.9, etiquetas: [], tramos: null },
  { clave: "chorizo", nombre: "Chorizo para guisar", unidad: "unidad", precio: 2.1, etiquetas: ["cerdo", "lactosa"], tramos: null },
];

// ---------------------------------------------------------------------------
// Colaboradores: 45 nombres inventados
// ---------------------------------------------------------------------------

export const NOMBRES = [
  "Ana Ruiz", "Pedro Navarro", "Lucía Gómez", "Javier Molina", "Carmen Ortega",
  "Miguel Serrano", "Rosa Delgado", "Antonio Vidal", "Pilar Esteban", "José Luis Rubio",
  "Teresa Marín", "Francisco Iglesias", "Mercedes Santos", "Manuel Herrero", "Isabel Pascual",
  "Luis Cano", "Dolores Prieto", "Alberto Calvo", "Elena Gallego", "Ramón Ibáñez",
  "Concepción León", "Jorge Cabrera", "Marta Domínguez", "Sergio Valero", "Beatriz Méndez",
  "Fernando Guerrero", "Raquel Muñoz", "Andrés Fuentes", "Victoria Carrasco", "Daniel Nieto",
  "Silvia Aguilar", "Rafael Pastor", "Inmaculada Soto", "Pablo Robles", "Nuria Benítez",
  "Ángel Montero", "Cristina Hidalgo", "Alfonso Medina", "Montserrat Rojas", "Enrique Arias",
  "Sonia Garrido", "Tomás Lorenzo", "Amparo Peña", "Óscar Bravo", "Gloria Requena",
];

/**
 * Cambios de estado que se aplican después de construir las semanas pasadas (como si
 * hubieran pasado hace poco): por posición en NOMBRES. Las pausas cuentan en días desde
 * el día de la carga; null es una pausa sin fecha de vuelta.
 */
export const CAMBIOS_DE_ESTADO: { posicion: number; estado: "pausado" | "baja"; pausaDias?: number | null }[] = [
  { posicion: 42, estado: "pausado", pausaDias: 30 },
  { posicion: 43, estado: "pausado", pausaDias: null },
  { posicion: 44, estado: "baja" },
];

/** `usuario+demoNN@dominio` a partir de la Gmail de la cesta (secreto DEMO_CORREO_BASE). */
export function aliasDeCorreo(base: string, numero: number): string {
  const m = /^([^@+\s]+)(?:\+[^@\s]*)?@([^@\s]+\.[^@\s]+)$/.exec(base.trim());
  if (!m) throw new ErrorDatosDePrueba("DEMO_CORREO_BASE no es una dirección de correo válida");
  return `${m[1]}+demo${String(numero).padStart(2, "0")}@${m[2]}`.toLowerCase();
}

/** ¿Es un alias de prueba de esa base? Lo usa el borrado (RD3). */
export function esAliasDePrueba(base: string, correo: string): boolean {
  const m = /^([^@+\s]+)(?:\+[^@\s]*)?@([^@\s]+)$/.exec(base.trim());
  if (!m) return false;
  const local = m[1].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dominio = m[2].toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${local}\\+demo\\d{2}@${dominio}$`).test(correo.toLowerCase());
}

// ---------------------------------------------------------------------------
// Familias y semanas
// ---------------------------------------------------------------------------

export type FamiliaDePrueba = {
  identificador: string;
  adultos: number;
  ninos: number;
  exclusiones: string[];
  /** Lo que se añade a mano (casos especiales del Excel). */
  extras: { clave: string; cantidad: number }[];
};

export const FAMILIAS: Record<string, FamiliaDePrueba> = {
  P01: { identificador: "Parroquia 01", adultos: 2, ninos: 2, exclusiones: [], extras: [] },
  P02: { identificador: "Parroquia 02", adultos: 1, ninos: 0, exclusiones: [], extras: [] },
  P03: { identificador: "Parroquia 03", adultos: 2, ninos: 3, exclusiones: ["cerdo"], extras: [{ clave: "pavo", cantidad: 2 }] },
  P04: {
    identificador: "Parroquia 04",
    adultos: 1,
    ninos: 1,
    exclusiones: [],
    extras: [
      { clave: "panales", cantidad: 2 },
      { clave: "leche_continuacion", cantidad: 1 },
    ],
  },
  P05: { identificador: "Parroquia 05", adultos: 2, ninos: 1, exclusiones: [], extras: [{ clave: "chorizo", cantidad: 1 }] },
  A01: { identificador: "Arciprestazgo 01", adultos: 3, ninos: 1, exclusiones: ["lactosa"], extras: [{ clave: "leche_sin_lactosa", cantidad: 4 }] },
  A02: { identificador: "Arciprestazgo 02", adultos: 2, ninos: 0, exclusiones: [], extras: [] },
  A03: { identificador: "Arciprestazgo 03", adultos: 1, ninos: 5, exclusiones: ["cerdo"], extras: [{ clave: "pavo", cantidad: 2 }] },
};

/**
 * Qué pasa en cada semana (spec §2):
 * - "cerrada": se envía, responden, se marca lo entregado y se cierra.
 *   `noPueden` dicen que no (y su sustituto confirma); `sinRespuesta` no contestan (y su
 *   sustituto confirma); `sinEntregar` confirmados que no se marcan como entregados.
 * - "enviada": se envía; `noPueden` dicen que no y su sustituto queda esperando;
 *   `esperando` no contestan todavía; el resto confirma. Pocos esperando: si nadie
 *   contesta, la tarea diaria les busca sustituto al vencer el plazo y, el día de la
 *   entrega, avisa al administrador de cada uno que siga sin cubrir.
 * - "borrador": solo las cestas.
 */
export type SemanaDePrueba = {
  /** Días desde el día de la carga hasta la entrega. */
  entrega: number;
  /** Días desde el día de la carga hasta el plazo de respuesta. */
  plazo: number;
  familias: (keyof typeof FAMILIAS)[];
} & (
  | { estado: "cerrada"; noPueden: number; sinRespuesta: number; sinEntregar: number }
  | { estado: "enviada"; noPueden: number; esperando: number }
  | { estado: "borrador" }
);

export const SEMANAS: SemanaDePrueba[] = [
  { entrega: -35, plazo: -38, familias: ["P01", "P02", "A01"], estado: "cerrada", noPueden: 1, sinRespuesta: 1, sinEntregar: 0 },
  { entrega: -21, plazo: -24, familias: ["P03", "P04", "A02"], estado: "cerrada", noPueden: 0, sinRespuesta: 0, sinEntregar: 0 },
  { entrega: -7, plazo: -10, familias: ["P01", "A03", "P05", "P02"], estado: "cerrada", noPueden: 0, sinRespuesta: 0, sinEntregar: 1 },
  { entrega: 5, plazo: 2, familias: ["P03", "A01", "P04"], estado: "enviada", noPueden: 1, esperando: 3 },
  { entrega: 12, plazo: 10, familias: ["P01", "A02", "A03"], estado: "borrador" },
];
