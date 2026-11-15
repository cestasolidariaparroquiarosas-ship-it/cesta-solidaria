// Borrado de los datos de prueba (iteración 0002, RD3): deja vacías las tablas de la app
// salvo las etiquetas de exclusión, y no toca las cuentas de administrador. Se niega si
// hay algún colaborador que no sea un alias de prueba: ya habría datos reales.

import { enTransaccion, ErrorDatosDePrueba, recuentos, type Bd, type Resumen } from "./cargar";
import { esAliasDePrueba } from "./datos";

export async function borrar(bd: Bd, opciones: { correoBase: string }): Promise<Resumen> {
  return enTransaccion(bd, async () => {
    // Nadie puede dar de alta un colaborador entre la comprobación y el borrado.
    await bd.query("lock table public.colaboradores in share row exclusive mode");
    const { rows } = await bd.query("select email from public.colaboradores");
    const ajenos = rows.filter((f) => !esAliasDePrueba(opciones.correoBase, String(f.email))).length;
    if (ajenos)
      throw new ErrorDatosDePrueba(
        `Hay ${ajenos} colaborador(es) que no son de prueba: parece que ya hay datos reales. No se ha borrado nada.`,
      );

    // Con los disparadores y las claves foráneas activos: borrar una semana arrastra sus
    // cestas y su reparto; una lista, sus cantidades; un alimento, sus etiquetas.
    // Los eventos de auditoría de las semanas de prueba se borran; el resto (por ejemplo,
    // el correo de prueba de Inicio) se conserva.
    await bd.query("delete from public.registro_eventos where semana_id is not null or asignacion_id is not null");
    await bd.query("delete from public.semanas");
    await bd.query("delete from public.colaboradores");
    await bd.query("delete from public.listas_base");
    await bd.query("delete from public.alimentos");

    const despues = await recuentos(bd);
    const quedan = Object.entries(despues).filter(([, n]) => n > 0);
    if (quedan.length)
      throw new ErrorDatosDePrueba(
        `Después de borrar quedarían filas (${quedan.map(([t, n]) => `${t}: ${n}`).join(", ")}). No se ha borrado nada.`,
      );
    return despues;
  });
}
