// Borrado de los datos de prueba (iteración 0002, RD3): deja vacías las tablas de la app
// salvo las etiquetas de exclusión, y no toca las cuentas de administrador. Se niega si
// hay algún colaborador que no sea un alias de prueba: ya habría datos reales.

import { enTransaccion, ErrorDatosDePrueba, recuentos, TABLAS, type Bd, type Resumen } from "./cargar";
import { esAliasDePrueba } from "./datos";

export async function borrar(bd: Bd, opciones: { correoBase: string }): Promise<Resumen> {
  return enTransaccion(bd, async () => {
    const { rows } = await bd.query("select email from public.colaboradores");
    const ajenos = rows.filter((f) => !esAliasDePrueba(opciones.correoBase, String(f.email))).length;
    if (ajenos)
      throw new ErrorDatosDePrueba(
        `Hay ${ajenos} colaborador(es) que no son de prueba: parece que ya hay datos reales. No se ha borrado nada.`,
      );

    // Las semanas enviadas y cerradas no dejan borrar sus cestas (disparadores de la app),
    // así que se desactivan los disparadores solo dentro de esta transacción. Con ellos
    // tampoco actúan las claves foráneas: se borra cada tabla, de las hijas a las madres.
    await bd.query("set local session_replication_role = replica");
    // Los eventos de auditoría de las semanas de prueba; el resto (p. ej. el correo de
    // prueba de Inicio) se conserva.
    await bd.query("delete from public.registro_eventos where semana_id is not null or asignacion_id is not null");
    for (const tabla of TABLAS) await bd.query(`delete from public.${tabla}`);
    await bd.query("set local session_replication_role = origin");

    return recuentos(bd);
  });
}
