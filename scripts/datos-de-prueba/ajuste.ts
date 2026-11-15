// Ajuste de la "cesta tipo" de los administradores (cantidades por tramos de familia) a
// la lista base de la app (por adulto y por niño, con la fórmula de R1). Lógica pura.

import { cantidadPropuesta } from "../../lib/dominio/cesta";

/** Los cinco tramos del Excel, en el orden de sus columnas. */
export const TRAMOS = ["1-2 personas", "1 adulto + 1 niño", "3-4 personas", "5 personas", "Más de 5"] as const;

/** Cantidades de un producto en cada tramo, en el orden de TRAMOS. */
export type CantidadesPorTramo = readonly [number, number, number, number, number];

/** Composiciones (adultos, niños) con las que se compara cada tramo (spec §2). */
export const COMPOSICIONES: readonly (readonly [number, number])[][] = [
  [
    [1, 0],
    [2, 0],
  ],
  [[1, 1]],
  [
    [2, 1],
    [2, 2],
  ],
  [[2, 3]],
  [
    [2, 4],
    [3, 3],
  ],
];

const PASOS = Array.from({ length: 13 }, (_, i) => i * 0.25); // 0, 0,25 … 3

export type Ajuste = { porAdulto: number; porNino: number; error: number };

/**
 * La pareja (por adulto, por niño), en múltiplos de 0,25 entre 0 y 3, que más se acerca
 * a las cantidades del Excel: la de menor suma de errores al cuadrado en todas las
 * composiciones. A igualdad, la de menos cantidad total y después la de menos por niño,
 * para que el resultado no dependa del orden de búsqueda.
 */
export function ajustar(tramos: CantidadesPorTramo): Ajuste {
  let mejor: Ajuste | null = null;
  for (const porAdulto of PASOS) {
    for (const porNino of PASOS) {
      let error = 0;
      COMPOSICIONES.forEach((composiciones, t) => {
        for (const [adultos, ninos] of composiciones) {
          const diferencia = cantidadPropuesta(adultos, ninos, porAdulto, porNino) - tramos[t];
          error += diferencia * diferencia;
        }
      });
      const candidato = { porAdulto, porNino, error };
      if (
        !mejor ||
        error < mejor.error ||
        (error === mejor.error && porAdulto + porNino < mejor.porAdulto + mejor.porNino) ||
        (error === mejor.error && porAdulto + porNino === mejor.porAdulto + mejor.porNino && porNino < mejor.porNino)
      )
        mejor = candidato;
    }
  }
  return mejor!;
}

/** Lo que da la app con un ajuste, en cada composición de cada tramo. */
export function cantidadesDeLaApp(a: Ajuste): number[][] {
  return COMPOSICIONES.map((composiciones) =>
    composiciones.map(([adultos, ninos]) => cantidadPropuesta(adultos, ninos, a.porAdulto, a.porNino)),
  );
}
