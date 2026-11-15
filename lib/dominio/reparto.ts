// R3 — Reparto equilibrado (spec §4, CA-11, CA-12). Lógica pura, sin base de datos.

import { leerEntero, LIMITES_CESTA } from "./cesta";

/** Un alimento de una cesta de la semana: `cantidad` piezas de `precio_unitario` cada una. */
export type ItemRepartible = {
  cesta_item_id: string;
  alimento_id: string;
  cantidad: number;
  precio_unitario: number;
};

export type AsignacionPropuesta = {
  colaborador_id: string;
  items: { cesta_item_id: string; cantidad: number }[];
  /** Euros. */
  gasto: number;
};

const centimos = (euros: number) => Math.round(euros * 100);

/**
 * R3.1 a R3.3: cada unidad es una pieza; de la más cara a la más barata, cada pieza va
 * al colaborador que lleva menos gasto. Si hay empate, al que ya lleva ese alimento
 * (para no partir "3 paquetes de arroz" sin necesidad) y, si no, al primero en el
 * orden de R2.
 *
 * R3.4 (CA-11): la diferencia entre el que más gasta y el que menos no supera la pieza
 * más cara. Cuando el que acaba gastando más recibió su última pieza p, era el que
 * menos llevaba; desde entonces los demás solo han sumado. Así que su gasto final es
 * como mucho el mínimo final + p.
 *
 * `colaboradores` son ids en el orden de R2. Los que no reciben nada (puede pasar si
 * hay pocas piezas muy caras) no aparecen: no tendría sentido mandarles un correo vacío.
 */
export function repartir(items: ItemRepartible[], colaboradores: string[]): AsignacionPropuesta[] {
  const piezas = items
    .flatMap((i) => Array.from({ length: i.cantidad }, () => i))
    .sort(
      (a, b) =>
        centimos(b.precio_unitario) - centimos(a.precio_unitario) ||
        a.alimento_id.localeCompare(b.alimento_id) ||
        a.cesta_item_id.localeCompare(b.cesta_item_id),
    );
  if (piezas.length === 0) return [];
  if (colaboradores.length === 0) throw new Error("No hay colaboradores para repartir");

  const gasto = colaboradores.map(() => 0);
  const alimentos = colaboradores.map(() => new Set<string>());
  const cantidades = colaboradores.map(() => new Map<string, number>());

  for (const pieza of piezas) {
    let elegido = 0;
    for (let c = 1; c < colaboradores.length; c++) {
      const menos = gasto[c] < gasto[elegido];
      const empataYLoLleva =
        gasto[c] === gasto[elegido] && alimentos[c].has(pieza.alimento_id) && !alimentos[elegido].has(pieza.alimento_id);
      if (menos || empataYLoLleva) elegido = c;
    }
    gasto[elegido] += centimos(pieza.precio_unitario);
    alimentos[elegido].add(pieza.alimento_id);
    const lleva = cantidades[elegido];
    lleva.set(pieza.cesta_item_id, (lleva.get(pieza.cesta_item_id) ?? 0) + 1);
  }

  return colaboradores
    .map((colaborador_id, c) => ({
      colaborador_id,
      items: [...cantidades[c]].map(([cesta_item_id, cantidad]) => ({ cesta_item_id, cantidad })),
      gasto: gasto[c] / 100,
    }))
    .filter((a) => a.items.length > 0);
}

// ---------------------------------------------------------------------------
// Para mostrar y editar el reparto
// ---------------------------------------------------------------------------

/** Un alimento de una asignación, tal como se guarda (por alimento de cesta). */
export type ItemAsignado = {
  alimento_id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
};

export type LineaReparto = {
  alimento_id: string;
  nombre: string;
  unidad: string;
  cantidad: number;
  gasto: number;
};

/**
 * Lo que lleva un colaborador, sumando el mismo alimento de distintas cestas. Se
 * agrupa también por unidad: si la unidad cambió en el catálogo entre una cesta y
 * otra, "2 paquetes de 1 kg" y "1 paquete de 500 g" no se suman.
 */
export function agruparPorAlimento(items: ItemAsignado[]): LineaReparto[] {
  const lineas = new Map<string, LineaReparto & { centimos: number }>();
  for (const i of items) {
    const clave = `${i.alimento_id}|${i.unidad}`;
    const linea = lineas.get(clave) ?? {
      alimento_id: i.alimento_id,
      nombre: i.nombre,
      unidad: i.unidad,
      cantidad: 0,
      gasto: 0,
      centimos: 0,
    };
    linea.cantidad += i.cantidad;
    linea.centimos += i.cantidad * centimos(i.precio_unitario);
    lineas.set(clave, linea);
  }
  return [...lineas.values()]
    .map(({ centimos: c, ...l }) => ({ ...l, gasto: c / 100 }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.unidad.localeCompare(b.unidad, "es"));
}

/** R3.5: ¿este gasto supera el precio base? Se avisa, pero se permite. */
export function superaPrecioBase(gasto: number, precioBase: number): boolean {
  return centimos(gasto) > centimos(precioBase);
}

/** Unidades que se mueven de un colaborador a otro: entero entre 1 y lo que lleva. */
export function validarMovimiento(
  valor: unknown,
  disponible: number,
): { ok: true; cantidad: number } | { ok: false; error: string } {
  const cantidad = leerEntero(valor, 1, LIMITES_CESTA.cantidad);
  if (cantidad === null) return { ok: false, error: "Escribe un número entero mayor que 0." };
  if (cantidad > disponible) return { ok: false, error: `Como mucho ${disponible}: es lo que lleva.` };
  return { ok: true, cantidad };
}
